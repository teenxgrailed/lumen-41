"use client";

import { useEffect, useState } from "react";

import { SIGN_IN_PROVIDERS } from "@/lib/auth/sign-in-provider-ids";
import { formatShortDate, newDate } from "@/lib/date-utils";

/**
 * What Account shows about how a person signs in and where. The data is what
 * the old Account panel already reads (`GET /api/account/lifecycle` lists the
 * linked providers) and the session itself; nothing here writes.
 */

export interface SignInMethod {
  /** "credentials" or a sign-in provider id. */
  id: string;
  label: string;
}

/** Password first, then the linked providers in the sign-in screen's order. */
export function signInMethods(providers: readonly string[]): SignInMethod[] {
  const out: SignInMethod[] = [];
  if (providers.includes("credentials")) {
    out.push({ id: "credentials", label: "Password" });
  }
  for (const p of SIGN_IN_PROVIDERS) {
    if (providers.includes(p.id)) out.push({ id: p.id, label: p.label });
  }
  return out;
}

/** Linked providers, or `null` while loading / when the read failed. */
export function useLinkedProviders(): string[] | null {
  const [providers, setProviders] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    void fetch("/api/account/lifecycle")
      .then(async (res) => {
        if (!res.ok) return null;
        const body = (await res.json()) as { providers?: unknown };
        return Array.isArray(body.providers)
          ? body.providers.filter((p): p is string => typeof p === "string")
          : null;
      })
      .catch(() => null)
      .then((list) => {
        if (live) setProviders(list);
      });
    return () => {
      live = false;
    };
  }, []);
  return providers;
}

/** "Chrome on macOS" from a user-agent string; "This browser" when unknown. */
export function describeDevice(ua: string | null | undefined): string {
  const s = ua ?? "";
  const os = /iPhone|iPad|iPod/.test(s)
    ? "iOS"
    : /Android/.test(s)
      ? "Android"
      : /Windows/.test(s)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(s)
          ? "macOS"
          : /Linux|X11/.test(s)
            ? "Linux"
            : null;
  const browser = /Edg\//.test(s)
    ? "Edge"
    : /OPR\/|Opera/.test(s)
      ? "Opera"
      : /Firefox\//.test(s)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(s)
          ? "Chrome"
          : /Safari\//.test(s)
            ? "Safari"
            : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "This browser";
}

/**
 * The line under "This device". Sessions are JWTs that last 30 days from the
 * last use, so the session's own expiry is the one date we can state; the
 * server keeps no list of other devices.
 */
export function deviceLine(
  ua: string | null | undefined,
  expires: string | null | undefined
): string {
  const what = describeDevice(ua);
  const end = expires ? newDate(expires) : null;
  return end && !Number.isNaN(end.getTime())
    ? `${what} · active now · signed in until ${formatShortDate(end)}`
    : `${what} · active now`;
}

/** Sends the signed-in address a reset link (the existing forgot-password route). */
export async function sendPasswordLink(email: string): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/reset-password/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
