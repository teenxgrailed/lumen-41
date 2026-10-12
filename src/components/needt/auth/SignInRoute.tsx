"use client";

/* SIGN IN, for real.
 *
 * `AuthScreen` is the design. This is the behaviour that was already shipping
 * in `@/components/auth/SignInForm`, moved behind it: NextAuth credentials,
 * the register endpoint, whichever third-party providers are configured, the
 * public-sign-up switch, password recovery and confirmation resend.
 *
 * Two things the design does not draw are kept anyway, because losing them
 * locks people out: recovering a password, and resending a confirmation. They
 * sit in `AuthScreen`'s `aside`, one quiet line under the password, at the
 * meta step of the type scale.
 *
 * Two things the design does drop are allowed to go: the separate "confirm
 * password" field, which the show/hide eye already covers, and the optional
 * name at sign-up, which Settings asks for later. Neither is load-bearing.
 */
import * as React from "react";

import { type ClientSafeProvider, getProviders, signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { IconType } from "react-icons";
import { FaMicrosoft } from "react-icons/fa";
import { LuChrome } from "react-icons/lu";

import { safeCallbackPath } from "@/lib/auth/callback-url";
import { isPublicSignupEnabledClient } from "@/lib/auth/client-public-signup";
import { oauthErrorMessage } from "@/lib/auth/oauth-error";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/notifications";

import { useResolvedTheme } from "../use-resolved-theme";
import {
  type AuthMode,
  type AuthProvider,
  type AuthResult,
  AuthScreen,
} from "./AuthScreen";

const LOG_SOURCE = "SignInRoute";

/** The landing page, where the waitlist form lives while sign-up is closed. */
const WAITLIST_URL = "https://needt.app";

type OAuthProviderId = "google" | "azure-ad";

const OAUTH: Readonly<
  Record<OAuthProviderId, { label: string; icon: IconType }>
> = {
  google: { label: "Google", icon: LuChrome },
  "azure-ad": { label: "Microsoft", icon: FaMicrosoft },
};

export function SignInRoute({
  callbackUrl,
  error,
}: {
  callbackUrl?: string;
  error?: string;
}) {
  const router = useRouter();
  const safeCallbackUrl = safeCallbackPath(callbackUrl);
  const theme = useResolvedTheme();

  const [mode, setMode] = React.useState<AuthMode>("login");
  const [allowSignup, setAllowSignup] = React.useState(false);
  /* Until the answer arrives neither invitation is drawn, so an open
     sign-up never flashes the waitlist line first. */
  const [signupKnown, setSignupKnown] = React.useState(false);
  const [configured, setConfigured] = React.useState<readonly AuthProvider[]>(
    []
  );
  const [providerBusy, setProviderBusy] = React.useState<string | null>(null);
  const [resending, setResending] = React.useState(false);
  /** The address the person last typed, so "resend" has something to send
   * to without `AuthScreen` having to hand its field out. */
  const typed = React.useRef("");

  React.useEffect(() => {
    void isPublicSignupEnabledClient().then((enabled) => {
      setAllowSignup(enabled);
      setSignupKnown(true);
    });
    void getProviders()
      .then((available: Record<string, ClientSafeProvider> | null) => {
        if (!available) return;
        setConfigured(
          (Object.keys(OAUTH) as OAuthProviderId[])
            .filter((id) => available[id])
            .map((id) => ({ id, ...OAUTH[id] }))
        );
      })
      .catch((providerError: unknown) => {
        void logger.warn(
          "Could not load OAuth providers",
          {
            error:
              providerError instanceof Error
                ? providerError.message
                : String(providerError),
          },
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
            /* The one refusal the design has its own words for. Everything
               else the server says, it says better than we would. */
            if (response.status === 409) return { ok: false, reason: "taken" };
            return {
              ok: false,
              message: body.error || "Could not create the account.",
            };
          }
        } catch (registerError) {
          void logger.error(
            "Registration failed",
            {
              error:
                registerError instanceof Error
                  ? registerError.message
                  : String(registerError),
            },
            LOG_SOURCE
          );
          return { ok: false, message: "Could not reach the server." };
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
            /* The account exists now; only the sign-in did not take. Sending
               them round again is better than leaving them on a screen that
               says the account could not be made. */
            notify.success("Account created", {
              description: "Sign in with your new credentials.",
            });
            setMode("login");
            return { ok: false, message: "Account created. Sign in below." };
          }
          return { ok: false, reason: "wrong" };
        }
      } catch (signInError) {
        void logger.error(
          "Sign in failed",
          {
            error:
              signInError instanceof Error
                ? signInError.message
                : String(signInError),
          },
          LOG_SOURCE
        );
        return { ok: false, message: "Could not reach the server." };
      }

      return { ok: true };
    },
    [safeCallbackUrl]
  );

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
    } catch (verificationError) {
      void logger.error(
        "Email verification resend failed",
        {
          error:
            verificationError instanceof Error
              ? verificationError.message
              : String(verificationError),
        },
        LOG_SOURCE
      );
      notify.error("Could not send verification email");
    } finally {
      setResending(false);
    }
  }, []);

  /* `.needt-v2` with a `data-theme` is the only scope the design's tokens
     resolve in; outside it the form draws white fields on a dark page. */
  return (
    <div
      className="needt-v2"
      data-theme={theme}
      style={{
        height: "100%",
        background: "var(--background)",
        color: "var(--text-primary)",
        font: "var(--type-ui)",
      }}
    >
      <AuthScreen
        mode={mode}
        onMode={setMode}
        onDone={() => {
          /* A full load, not a router push: the session cookie is new and every
           server component on the way in has to see it. */
          window.location.href = safeCallbackUrl;
        }}
        onSubmit={submit}
        providers={configured}
        providerBusy={providerBusy}
        onProvider={(id) => {
          setProviderBusy(id);
          void signIn(id, { callbackUrl: safeCallbackUrl }).catch(
            (providerError: unknown) => {
              void logger.error(
                "OAuth sign in failed",
                {
                  provider: id,
                  error:
                    providerError instanceof Error
                      ? providerError.message
                      : String(providerError),
                },
                LOG_SOURCE
              );
              notify.error("Could not continue with that account");
              setProviderBusy(null);
            }
          );
        }}
        notice={oauthErrorMessage(error) || null}
        allowSignup={allowSignup}
        aside={
          mode === "login" ? (
            <span
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 11,
                font: "var(--type-meta)",
                color: "var(--text-muted)",
              }}
            >
              <button
                type="button"
                onClick={() => void resend()}
                disabled={resending}
                style={{
                  border: 0,
                  padding: 0,
                  background: "none",
                  cursor: "default",
                  font: "var(--type-meta)",
                  color: "var(--text-muted)",
                }}
              >
                {resending ? "Sending…" : "Resend confirmation"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/auth/reset-password")}
                style={{
                  border: 0,
                  padding: 0,
                  background: "none",
                  cursor: "default",
                  font: "var(--type-meta)",
                  color: "var(--text-muted)",
                }}
              >
                Forgot password?
              </button>
            </span>
          ) : null
        }
        footer={
          <>
            {signupKnown && !allowSignup ? (
              /* Registration is closed until launch. The person who came to
                 make an account is told where the door is instead. */
              <p
                style={{
                  margin: 0,
                  textAlign: "center",
                  font: "var(--type-meta)",
                  color: "var(--text-muted)",
                }}
              >
                New here? Needt opens soon.{" "}
                <a
                  href={WAITLIST_URL}
                  style={{
                    font: "var(--type-meta-medium)",
                    color: "var(--accent)",
                  }}
                >
                  Join the waitlist
                </a>
              </p>
            ) : null}
            <p
              style={{
                margin: 0,
                textAlign: "center",
                font: "var(--type-meta)",
                color: "var(--text-disabled)",
              }}
            >
              <Link href="/terms">Terms</Link>
              {" · "}
              <Link href="/privacy">Privacy</Link>
            </p>
          </>
        }
      />
    </div>
  );
}
