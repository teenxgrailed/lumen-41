"use client";

/* SIGN IN, for real, on the v3 screen. The behaviour is what already ships in
   the v2 `SignInRoute` / `SignInForm`: NextAuth credentials, the register
   endpoint, whichever third-party providers are configured, the public-signup
   switch, password recovery and confirmation resend. Only the face is new. */
import * as React from "react";

import { type ClientSafeProvider, getProviders, signIn } from "next-auth/react";

import type { IconType } from "react-icons";
import { FaMicrosoft } from "react-icons/fa";
import { LuChrome } from "react-icons/lu";

import { safeCallbackPath } from "@/lib/auth/callback-url";
import { isPublicSignupEnabledClient } from "@/lib/auth/client-public-signup";
import { oauthErrorMessage } from "@/lib/auth/oauth-error";
import { logger } from "@/lib/logger";
import type { PhoneUi } from "@/lib/needt3/phone-ui";
import { notify } from "@/lib/notifications";

import { PhoneAuth } from "../phone/auth";
import { useResolvedPhoneUi } from "../root/phone-ui-context";
import { AuthScope } from "./AuthScope";
import {
  type AuthMode,
  type AuthProvider,
  type AuthResult,
  AuthScreen,
} from "./AuthScreen";

const LOG_SOURCE = "needt3-signin";

type OAuthProviderId = "google" | "azure-ad";

const OAUTH: Readonly<
  Record<OAuthProviderId, { label: string; icon: IconType }>
> = {
  google: { label: "Google", icon: LuChrome },
  "azure-ad": { label: "Microsoft", icon: FaMicrosoft },
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function V3SignInRoute({
  callbackUrl,
  error,
  initialUi = "desktop",
  uiForced = false,
}: {
  callbackUrl?: string;
  error?: string;
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

  React.useEffect(() => {
    void isPublicSignupEnabledClient().then(setAllowSignup);
    void getProviders()
      .then((available: Record<string, ClientSafeProvider> | null) => {
        if (!available) return;
        setConfigured(
          (Object.keys(OAUTH) as OAuthProviderId[])
            .filter((id) => available[id])
            .map((id) => ({ id, ...OAUTH[id] }))
        );
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
      return { ok: true };
    },
    [safeCallbackUrl]
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
        onDone={() => {
          /* A full load, not a router push: the session cookie is new and every
             server component on the way in has to see it. */
          window.location.href = dest.current;
        }}
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
        allowSignup={allowSignup === true}
        signupClosed={allowSignup === false}
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
