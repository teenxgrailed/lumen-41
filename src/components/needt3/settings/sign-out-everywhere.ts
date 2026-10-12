"use client";

import { useRef, useState } from "react";

import { signOutOfNeedt } from "@/lib/auth/client-sign-out";
import { notify } from "@/lib/notifications";

/**
 * "Sign out of all devices" (the old AccountSettings, PR #118): revoke every
 * session on the server, then sign this browser out through the one sign-out
 * path. On failure the person is told and stays signed in.
 */
export async function signOutEverywhere(
  deps: {
    fetch?: typeof fetch;
    signOut?: () => Promise<void>;
  } = {}
): Promise<boolean> {
  const f = deps.fetch ?? fetch;
  const out = deps.signOut ?? (() => signOutOfNeedt());
  try {
    const res = await f("/api/account/sessions/revoke", { method: "POST" });
    if (!res.ok) throw new Error("REVOKE_FAILED");
    await out();
    return true;
  } catch {
    notify.error("Could not sign out of all devices");
    return false;
  }
}

/** The row's state: armed (asking to confirm) and busy (the revoke running). */
export function useSignOutEverywhere() {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const going = useRef(false);
  const confirm = async () => {
    if (going.current) return;
    going.current = true;
    setBusy(true);
    const ok = await signOutEverywhere();
    // on success the page is leaving; only a failure comes back here
    if (!ok) {
      going.current = false;
      setBusy(false);
      setArmed(false);
    }
  };
  return {
    armed,
    busy,
    arm: () => setArmed(true),
    cancel: () => setArmed(false),
    confirm,
  };
}

export const EVERYWHERE_COPY = {
  title: "Sign out of all devices",
  desc: "Ends every session of this account, on every phone and computer.",
  ask: "Every device will need to sign in again — this one too.",
  cta: "Sign out everywhere",
  busy: "Signing out…",
};
