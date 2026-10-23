/* The two pages that carry a browser sign-in into the desktop app
   (/auth/desktop and /auth/desktop-complete). Pure decisions only; the
   server half is src/lib/auth/desktop-handoff.ts. */
import {
  DESKTOP_CHALLENGE_PATTERN,
  DESKTOP_CODE_PATTERN,
  DESKTOP_VERIFIER_PATTERN,
} from "@/lib/auth/desktop-handoff-shape";

/** The link that hands a code to the app (`apps/desktop` registers `needt://`). */
export function desktopDeepLink(code: string): string | null {
  if (!DESKTOP_CODE_PATTERN.test(code)) return null;
  return `needt://auth?code=${encodeURIComponent(code)}`;
}

/** Asks the running app to begin sign-in again (its navigation guard takes it). */
export const DESKTOP_RESTART_LINK = "needt://start-sign-in";

export type HandoffStep = "invalid" | "ready" | "working" | "sent" | "error";

export type HandoffApp = "desktop" | "ios";

export const HANDOFF_COPY: Record<
  HandoffStep,
  { a: string; b: string; line: (email: string, app?: HandoffApp) => string }
> = {
  invalid: {
    a: "This link",
    b: "is not valid",
    line: (_email, app) =>
      `Start signing in again from the Needt ${app === "ios" ? "app" : "desktop app"}.`,
  },
  ready: {
    a: "Open",
    b: "Needt",
    line: (email, app) =>
      `You are signed in as ${email}. Open the Needt ${app === "ios" ? "app" : "desktop app"} with this account?`,
  },
  working: {
    a: "Opening",
    b: "Needt",
    line: () => "One moment.",
  },
  sent: {
    a: "Switch to",
    b: "the app",
    line: () =>
      "If your browser asks, allow it to open Needt. Then you can close this tab.",
  },
  error: {
    a: "That didn’t",
    b: "go through",
    line: () => "Nothing was shared with the app. Try again.",
  },
};

/** A challenge in the query string is usable only if it has the digest's shape. */
export function validChallenge(value: string | null | undefined): boolean {
  return typeof value === "string" && DESKTOP_CHALLENGE_PATTERN.test(value);
}

/**
 * `#code=…&verifier=…`, as the app puts them in the fragment of
 * /auth/desktop-complete (a fragment never reaches a server, a log or a
 * Referer). Null unless both parts have the right shape.
 */
export function parseCompleteFragment(
  hash: string
): { code: string; verifier: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const code = params.get("code") ?? "";
  const verifier = params.get("verifier") ?? "";
  if (
    !DESKTOP_CODE_PATTERN.test(code) ||
    !DESKTOP_VERIFIER_PATTERN.test(verifier)
  ) {
    return null;
  }
  return { code, verifier };
}

export type CompleteStep = "working" | "failed" | "invalid";

export const COMPLETE_COPY: Record<
  CompleteStep,
  { a: string; b: string; line: string }
> = {
  working: {
    a: "Signing",
    b: "you in",
    line: "Taking you to Today.",
  },
  failed: {
    a: "That link",
    b: "has expired",
    line: "Sign-in links work once and only for a minute. Start again from the browser.",
  },
  invalid: {
    a: "This page is",
    b: "for the app",
    line: "Open Needt on your desktop and choose Sign in.",
  },
};
