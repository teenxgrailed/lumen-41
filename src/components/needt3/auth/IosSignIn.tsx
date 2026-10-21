"use client";

/* SIGN IN INSIDE THE iOS APP, ported 1:1 from additions-2/ios-assets
   (ios-sign.jsx / ios-sign.css). Apple first (App Store rule once Google is
   offered), then Google, then email as a text button; 54 pt, fully rounded.
   Busy: a spinner replaces the logo. Error: one red-dot line saying what
   happened. Shown only inside the native shell; browsers keep the web
   sign-in. */
import * as React from "react";

import Link from "next/link";

import { runNativeSignIn } from "@/lib/auth/native-sign-in";
import { logger } from "@/lib/logger";
import { runNativeAuthSession } from "@/lib/native";

import { NeedtAppIcon } from "../wordmark";

const LOG_SOURCE = "needt3-ios-signin";

const IOS_G = (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"
    />
    <path
      fill="#FBBC05"
      d="M10.5 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.9-6.1z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.7l-7.9 6.1C6.6 42.6 14.6 48 24 48z"
    />
  </svg>
);

const IOS_APPLE = (
  <svg viewBox="0 0 17 20" fill="currentColor" aria-hidden="true">
    <path d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.3-.9C3.7 4.8 2.1 5.8 1.2 7.3c-1.8 3.2-.5 7.9 1.3 10.4.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.8-1-2.8-4.3zM11.6 3c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z" />
  </svg>
);

type Provider = "apple" | "google";
const NAME: Record<Provider, string> = { apple: "Apple", google: "Google" };
const OTHER: Record<Provider, string> = { apple: "Google", google: "Apple" };

export function iosSignInError(
  provider: Provider,
  reason: "cancelled" | "unavailable" | "failed" | "off"
): string {
  if (reason === "cancelled") {
    return `${NAME[provider]} sign-in was cancelled. Try again, or use ${OTHER[provider]} or email.`;
  }
  if (reason === "off") {
    return `${NAME[provider]} sign-in is not set up yet. Use ${OTHER[provider]} or email.`;
  }
  return `Could not sign in with ${NAME[provider]}. Try again, or use ${OTHER[provider]} or email.`;
}

export function IosSignIn({
  configured,
  onEmail,
}: {
  /** Provider ids the server reports as configured (NextAuth `getProviders`); null until it answers. */
  configured: readonly string[] | null;
  onEmail: () => void;
}) {
  const [busy, setBusy] = React.useState<Provider | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function start(provider: Provider) {
    if (busy) return;
    setError(null);
    // A provider the server has no keys for would only end on its error page.
    if (configured && !configured.includes(provider)) {
      setError(iosSignInError(provider, "off"));
      return;
    }
    setBusy(provider);
    try {
      const result = await runNativeSignIn(
        provider,
        runNativeAuthSession,
        window.location.origin
      );
      if (result.ok) {
        // Same webview, so the session cookie lands where the app lives.
        window.location.assign(result.path);
        return;
      }
      setError(iosSignInError(provider, result.reason));
    } catch (e) {
      void logger.error(
        "iOS sign-in failed",
        { provider, error: e instanceof Error ? e.message : String(e) },
        LOG_SOURCE
      );
      setError(iosSignInError(provider, "failed"));
    }
    setBusy(null);
  }

  return (
    <div className="ios-sign" data-ios-sign>
      <div className="top">
        <NeedtAppIcon size={104} />
        <h1>Needt</h1>
        <p>
          Tasks, calendar and docs in one place — and a day that plans itself.
        </p>
      </div>
      <div className="acts">
        {error ? (
          <div className="ios-err" role="alert">
            <i />
            {error}
          </div>
        ) : null}
        <button
          type="button"
          className={"ios-btn apple" + (busy === "apple" ? " busy" : "")}
          onClick={() => void start("apple")}
          aria-busy={busy === "apple"}
          data-ios-sign-apple
        >
          {busy === "apple" ? <span className="ios-spin" /> : IOS_APPLE}
          Sign in with Apple
        </button>
        <button
          type="button"
          className={"ios-btn google" + (busy === "google" ? " busy" : "")}
          onClick={() => void start("google")}
          aria-busy={busy === "google"}
          data-ios-sign-google
        >
          {busy === "google" ? <span className="ios-spin" /> : IOS_G}
          Continue with Google
        </button>
        <button
          type="button"
          className="ios-btn email"
          onClick={onEmail}
          disabled={busy !== null}
          data-ios-sign-email
        >
          Continue with email
        </button>
        <div className="ios-legal">
          By continuing you agree to the <Link href="/terms">Terms</Link> and{" "}
          <Link href="/privacy">Privacy notice</Link>.
        </div>
      </div>
    </div>
  );
}
