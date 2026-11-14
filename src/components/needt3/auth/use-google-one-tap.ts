"use client";

/* GOOGLE ONE TAP on the sign-in screens. Google's own prompt floats over the
   page and hands back an ID token; the host trades it for a session through
   the `google-onetap` NextAuth provider (src/lib/auth/google-one-tap.ts). The
   script is loaded only when the server says Google is configured, so a
   deployment without Google never contacts accounts.google.com. */
import * as React from "react";

import { logger } from "@/lib/logger";

const LOG_SOURCE = "needt3-google-one-tap";

/** The public client id, or null when Google sign-in is not configured. */
export const GOOGLE_CLIENT_ENDPOINT = "/api/auth/google-client";
export const GSI_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const GSI_SCRIPT_ID = "google-gsi-client";

interface GsiId {
  initialize(options: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
    itp_support?: boolean;
  }): void;
  prompt(): void;
  cancel(): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GsiId } };
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The configured client id, or null (also when the question cannot be had). */
export async function fetchGoogleClientId(): Promise<string | null> {
  try {
    const response = await fetch(GOOGLE_CLIENT_ENDPOINT, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { clientId?: unknown };
    return typeof data.clientId === "string" && data.clientId
      ? data.clientId
      : null;
  } catch (e) {
    void logger.warn(
      "Could not read the Google client id",
      { error: message(e) },
      LOG_SOURCE
    );
    return null;
  }
}

/** Adds Google's loader once; resolves when it has run. */
export function loadGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.getElementById(GSI_SCRIPT_ID);
    const script =
      (existing as HTMLScriptElement | null) ??
      Object.assign(document.createElement("script"), {
        id: GSI_SCRIPT_ID,
        src: GSI_SCRIPT_URL,
        async: true,
        defer: true,
      });
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("gsi blocked")), {
      once: true,
    });
    if (!existing) document.head.appendChild(script);
  });
}

/**
 * Shows the One Tap prompt when Google is configured and `enabled`. The
 * callback gets the ID token Google returns; it is not trusted until the
 * server has verified it.
 */
export function useGoogleOneTap({
  enabled,
  onCredential,
}: {
  enabled: boolean;
  onCredential: (credential: string) => void;
}) {
  const handler = React.useRef(onCredential);
  React.useEffect(() => {
    handler.current = onCredential;
  }, [onCredential]);

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const clientId = await fetchGoogleClientId();
      if (!clientId || cancelled) return;
      try {
        await loadGsiScript();
      } catch (e) {
        void logger.warn(
          "Google One Tap could not load",
          { error: message(e) },
          LOG_SOURCE
        );
        return;
      }
      const gsi = window.google?.accounts?.id;
      if (!gsi || cancelled) return;
      gsi.initialize({
        client_id: clientId,
        callback: ({ credential }) => {
          if (credential) handler.current(credential);
        },
        auto_select: false,
        cancel_on_tap_outside: false,
        use_fedcm_for_prompt: true,
        itp_support: true,
      });
      gsi.prompt();
    })();
    return () => {
      cancelled = true;
      window.google?.accounts?.id?.cancel();
    };
  }, [enabled]);
}
