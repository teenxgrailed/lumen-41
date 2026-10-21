/**
 * Sign-in for the iOS app (apps/ios). Providers refuse embedded webviews
 * (Google) or need the system's own sheet (Apple), so the app opens the web
 * sign-in in an ASWebAuthenticationSession (the `NeedtAuth` plugin) and gets
 * the result back through the same one-time-code handoff the desktop app uses
 * (src/lib/auth/desktop-handoff.ts): PKCE, a code that lives 60 seconds and
 * works once, `needt://auth?code=` as the way back, and the app's own webview
 * trading code + verifier for the session cookie at /auth/desktop-complete.
 *
 * Pure helpers only; the native call is in `@/lib/native`.
 */
import {
  DESKTOP_CODE_PATTERN,
  DESKTOP_VERIFIER_PATTERN,
} from "@/lib/auth/desktop-handoff-shape";
import { isSignInProviderId } from "@/lib/auth/sign-in-provider-ids";

/** The scheme the confirmation page hands the code to (`needt://auth`). */
export const NATIVE_CALLBACK_SCHEME = "needt";

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** 32 random bytes, base64url: 43 characters. Kept in memory, never sent. */
export function newNativeVerifier(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** base64url(sha256(verifier)), what the server stores next to the code. */
export async function nativeChallengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return base64url(new Uint8Array(digest));
}

/**
 * The https page the system sheet opens: the normal sign-in, pre-pointed at
 * one provider, that returns to the confirmation page (/auth/desktop) which
 * hands the code back. `client=ios` only changes that page's wording.
 */
export function nativeSignInUrl(
  origin: string,
  provider: string,
  challenge: string
): string | null {
  if (!isSignInProviderId(provider)) return null;
  const back = `/auth/desktop?challenge=${encodeURIComponent(challenge)}&client=ios`;
  const url = new URL("/auth/signin", origin);
  url.searchParams.set("callbackUrl", back);
  url.searchParams.set("provider", provider);
  return url.toString();
}

/** The one-time code in `needt://auth?code=...`, or null for anything else. */
export function codeFromCallback(link: string): string | null {
  try {
    const url = new URL(link);
    if (url.protocol !== `${NATIVE_CALLBACK_SCHEME}:`) return null;
    if (url.hostname !== "auth") return null;
    const code = url.searchParams.get("code") ?? "";
    return DESKTOP_CODE_PATTERN.test(code) ? code : null;
  } catch {
    return null;
  }
}

/** The page that trades the pair for a session; both parts ride in the fragment. */
export function nativeCompletePath(
  code: string,
  verifier: string
): string | null {
  if (
    !DESKTOP_CODE_PATTERN.test(code) ||
    !DESKTOP_VERIFIER_PATTERN.test(verifier)
  ) {
    return null;
  }
  return `/auth/desktop-complete#code=${encodeURIComponent(code)}&verifier=${encodeURIComponent(verifier)}`;
}

export type NativeSignInResult =
  | { ok: true; path: string }
  | { ok: false; reason: "cancelled" | "unavailable" | "failed" };

type AuthSession = (
  url: string,
  scheme: string
) => Promise<
  | { ok: true; url: string }
  | { ok: false; reason: "cancelled" | "unavailable" | "failed" }
>;

/** The whole round trip: sheet, code, and the path that finishes it. */
export async function runNativeSignIn(
  provider: string,
  run: AuthSession,
  origin: string
): Promise<NativeSignInResult> {
  const verifier = newNativeVerifier();
  const challenge = await nativeChallengeFor(verifier);
  const url = nativeSignInUrl(origin, provider, challenge);
  if (!url) return { ok: false, reason: "failed" };
  const result = await run(url, NATIVE_CALLBACK_SCHEME);
  if (!result.ok) return result;
  const code = codeFromCallback(result.url);
  const path = code ? nativeCompletePath(code, verifier) : null;
  return path ? { ok: true, path } : { ok: false, reason: "failed" };
}
