"use client";

/* SIGN IN, for real, on the v3 screen. The behaviour is what already ships in
   the v2 `SignInRoute` / `SignInForm`: NextAuth credentials, the register
   endpoint, whichever third-party providers are configured, the public-signup
   switch, password recovery and confirmation resend. Only the face is new. */
import * as React from "react";

import { type ClientSafeProvider, getProviders, signIn } from "next-auth/react";

import type { IconType } from "react-icons";

import { safeCallbackPath } from "@/lib/auth/callback-url";
import { oauthErrorMessage } from "@/lib/auth/oauth-error";
import {
  SIGN_IN_PROVIDERS,
  type SignInProviderId,
} from "@/lib/auth/sign-in-provider-ids";
import { logger } from "@/lib/logger";
import type { PhoneUi } from "@/lib/needt3/phone-ui";
import { notify } from "@/lib/notifications";

import { brandGlyph, brandMonoGlyph } from "../brand";
import { PhoneAuth } from "../phone/auth";
import { useResolvedPhoneUi } from "../root/phone-ui-context";
import { AuthScope } from "./AuthScope";
import {
  type AuthMode,
  type AuthProvider,
  type AuthResult,
  AuthScreen,
} from "./AuthScreen";
import { fetchPublicSignup, signupFlags } from "./public-signup-state";
import { useAuthSteps } from "./use-auth-fields";

const LOG_SOURCE = "needt3-signin";

/* Each provider's mark: full colour where it reads on any button, one colour
   (the button's text colour) where the brand allows its mark in black or
   white. */
const ICONS: Readonly<Record<SignInProviderId, IconType>> = {
  google: brandGlyph("google"),
  apple: brandMonoGlyph("apple"),
  github: brandMonoGlyph("github"),
  "azure-ad": brandGlyph("microsoft"),
  openai: brandMonoGlyph("chatgpt"),
  discord: brandMonoGlyph("discord"),
  twitter: brandMonoGlyph("x"),
  linkedin: brandGlyph("linkedin"),
};

/** The configured providers NextAuth reports, in our order, as buttons. */
export function configuredSignInProviders(
  available: Record<string, unknown> | null | undefined
): AuthProvider[] {
  if (!available) return [];
  return SIGN_IN_PROVIDERS.filter((p) => available[p.id]).map((p) => ({
    id: p.id,
    label: p.label,
    icon: ICONS[p.id],
  }));
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function V3SignInRoute({
  callbackUrl,
  error,
  initialUi = "desktop",
  uiForced = false,
  startRecover = false,
}: {
  callbackUrl?: string;
  error?: string;
  /** Open on "Forgot your password?" (/auth/reset-password without a token). */
  startRecover?: boolean;
  /** The server's pick for the first render (`phoneUiFrom`). */
  initialUi?: PhoneUi;
  /** The `needt-ui` cookie pinned a side: the width never overrides it. */
  uiForced?: boolean;
}) {
  /* A signed-out visitor has no frame around the page, so this route reads the
     same server pick and width listener the frame does. */
  const ui = useResolvedPhoneUi(initialUi, uiForced);
  const safeCallbackUrl = safeCallbackPath(callbackUrl);
  const [mode, setMode] = React.useState<AuthMode>("login");
  /* The two fields live here, above the face switch: crossing 700px keeps what
     was typed. */
  const [mail, setMail] = React.useState("");
  const [pass, setPass] = React.useState("");
  const fields = React.useMemo(
    () => ({ mail, pass, setMail, setPass }),
    [mail, pass]
  );
  /* ... and so do the flow's steps: recovery open, last refusal, touched. */
  const steps = useAuthSteps(undefined);
  const { setRecover } = steps;
  React.useEffect(() => {
    if (startRecover) setRecover("ask");
    // Once, on arrival: closing recovery afterwards must stay closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* null until /api/auth/public-signup has answered: neither "Create one" nor
     the waitlist line is drawn before then. */
  const [allowSignup, setAllowSignup] = React.useState<boolean | null>(null);
  const [configured, setConfigured] = React.useState<readonly AuthProvider[]>(
    []
  );
  const [providerBusy, setProviderBusy] = React.useState<string | null>(null);
  const [resending, setResending] = React.useState(false);
  /** The address last typed, so "resend" has something to send to. */
  const typed = React.useRef("");
  /** A new account goes on to setup; a returning one to where it was going. */
  const dest = React.useRef(safeCallbackUrl);
  const leaving = React.useRef(false);

  /* A full load, not a router push: the session cookie is new and every server
     component on the way in has to see it. Done here, in the route that
     survives a face swap, and not only in the screen's `onDone`, which is
     skipped when the screen it belongs to has been replaced mid-request. */
  const leave = React.useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    window.location.href = dest.current;
  }, []);

  React.useEffect(() => {
    void fetchPublicSignup().then(setAllowSignup);
    void getProviders()
      .then((available: Record<string, ClientSafeProvider> | null) => {
        if (!available) return;
        setConfigured(configuredSignInProviders(available));
      })
      .catch((e: unknown) => {
        void logger.warn(
          "Could not load OAuth providers",
          { error: message(e) },
          LOG_SOURCE
        );
      });
  }, []);

  const submit = React.useCallback(
    async (input: {
      mode: AuthMode;
      email: string;
      password: string;
    }): Promise<AuthResult> => {
      const email = input.email.trim().toLowerCase();
      typed.current = email;
      dest.current = input.mode === "signup" ? "/setup" : safeCallbackUrl;

      if (input.mode === "signup") {
        try {
          const response = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password: input.password }),
          });
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          if (!response.ok) {
            if (response.status === 409) return { ok: false, reason: "taken" };
            return {
              ok: false,
              message: body.error || "Could not create the account.",
            };
          }
        } catch (e) {
          void logger.error(
            "Registration failed",
            { error: message(e) },
            LOG_SOURCE
          );
          return { ok: false, network: true };
        }
      }

      try {
        const result = await signIn("credentials", {
          email,
          password: input.password,
          redirect: false,
          callbackUrl: safeCallbackUrl,
        });
        if (result?.error) {
          if (input.mode === "signup") {
            notify.success("Account created", {
              description: "Sign in with your new credentials.",
            });
            setMode("login");
            return { ok: false, message: "Account created. Sign in below." };
          }
          return { ok: false, reason: "wrong" };
        }
      } catch (e) {
        void logger.error("Sign in failed", { error: message(e) }, LOG_SOURCE);
        return { ok: false, network: true };
      }
      leave();
      return { ok: true };
    },
    [safeCallbackUrl, leave]
  );

  const recover = React.useCallback(async (email: string) => {
    typed.current = email.trim().toLowerCase();
    try {
      /* The server answers the same whether or not the account exists. */
      const response = await fetch("/api/auth/reset-password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: typed.current }),
      });
      if (response.status === 429) return "limited" as const;
      return response.ok;
    } catch (e) {
      void logger.error(
        "Password reset request failed",
        { error: message(e) },
        LOG_SOURCE
      );
      return false;
    }
  }, []);

  const resend = React.useCallback(async () => {
    if (!typed.current) {
      notify.error("Enter your email first");
      return;
    }
    setResending(true);
    try {
      const response = await fetch("/api/auth/email-verification/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: typed.current }),
      });
      if (!response.ok) throw new Error("Could not send verification email");
      notify.success(
        "If the account needs confirmation, an email is on its way."
      );
    } catch (e) {
      void logger.error(
        "Email verification resend failed",
        { error: message(e) },
        LOG_SOURCE
      );
      notify.error("Could not send verification email");
    } finally {
      setResending(false);
    }
  }, []);

  const Screen = ui === "phone" ? PhoneAuth : AuthScreen;

  return (
    <AuthScope>
      <Screen
        mode={mode}
        onMode={setMode}
        onDone={leave}
        fields={fields}
        steps={steps}
        onSubmit={submit}
        onRecover={recover}
        providers={configured}
        providerBusy={providerBusy}
        onProvider={(id) => {
          setProviderBusy(id);
          void signIn(id, { callbackUrl: safeCallbackUrl }).catch(
            (e: unknown) => {
              void logger.error(
                "OAuth sign in failed",
                { provider: id, error: message(e) },
                LOG_SOURCE
              );
              notify.error("Could not continue with that account");
              setProviderBusy(null);
            }
          );
        }}
        notice={oauthErrorMessage(error) || null}
        {...signupFlags(allowSignup)}
        aside={
          <button
            type="button"
            className="ax-link auth-forgot"
            onClick={() => void resend()}
            disabled={resending}
          >
            {resending ? "Sending…" : "Resend confirmation"}
          </button>
        }
      />
    </AuthScope>
  );
}
