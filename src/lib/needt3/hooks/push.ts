"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser notifications on this device, as one small state machine:
 *
 * - `needs-install`  iOS Safari outside the Home Screen app (no push there)
 * - `unsupported`    no service worker / Push API / Notification API
 * - `unconfigured`   the server has no VAPID keys
 * - `blocked`        permission was denied; only the browser settings undo it
 * - `off`            can be enabled with a tap
 * - `on`             permission granted and this device is subscribed
 *
 * The VAPID public key comes from `GET /api/push-subscriptions` at runtime,
 * never from the client bundle.
 */
export type PushState =
  | "loading"
  | "needs-install"
  | "unsupported"
  | "unconfigured"
  | "blocked"
  | "off"
  | "on";

export type PushEnv = {
  isIos: boolean;
  standalone: boolean;
  supported: boolean;
  permission: NotificationPermission | "unavailable";
};

export function readPushEnv(): PushEnv {
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const supported =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  return {
    isIos,
    standalone,
    supported,
    permission:
      "Notification" in window ? Notification.permission : "unavailable",
  };
}

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

type ServerConfig = { configured: boolean; publicKey: string | null };

async function loadConfig(): Promise<ServerConfig> {
  const response = await fetch("/api/push-subscriptions", {
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("config");
  const body = (await response.json()) as Partial<ServerConfig>;
  return {
    configured: body.configured === true,
    publicKey: body.publicKey ?? null,
  };
}

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing?.active) return existing;
  // PWARegister registers it at app start; give it a moment, never hang.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
  ]);
}

async function saveSubscription(subscription: PushSubscription) {
  const response = await fetch("/api/push-subscriptions", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw new Error("save");
}

export type PushController = {
  state: PushState;
  busy: boolean;
  /** Must be called from a click: iOS only shows the prompt from a gesture. */
  enable: () => Promise<"ok" | "denied" | "failed">;
  disable: () => Promise<void>;
  sendTest: () => Promise<"ok" | "expired" | "failed">;
};

export function usePushNotifications(): PushController {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const config = useRef<ServerConfig | null>(null);

  const refresh = useCallback(async () => {
    const env = readPushEnv();
    if (env.isIos && !env.standalone) return setState("needs-install");
    if (!env.supported) return setState("unsupported");
    if (env.permission === "denied") return setState("blocked");
    try {
      config.current = await loadConfig();
    } catch {
      return setState("off");
    }
    if (!config.current.configured) return setState("unconfigured");
    if (env.permission !== "granted") return setState("off");
    const registration = await readyRegistration();
    const subscription = await registration?.pushManager
      .getSubscription()
      .catch(() => null);
    if (!subscription) return setState("off");
    // Re-save quietly so the server copy is never older than the browser's.
    void saveSubscription(subscription).catch(() => undefined);
    setState("on");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    // Ask first: anything awaited before this call can make iOS treat the
    // request as not coming from a tap.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setState(permission === "denied" ? "blocked" : "off");
      return "denied" as const;
    }
    setBusy(true);
    try {
      const server = config.current ?? (await loadConfig());
      if (!server.publicKey) {
        setState("unconfigured");
        return "failed" as const;
      }
      const registration = await readyRegistration();
      if (!registration) throw new Error("no service worker");
      const key = urlBase64ToUint8Array(server.publicKey);
      let subscription: PushSubscription;
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
      } catch {
        // A subscription made with another key blocks subscribe(); drop it.
        await (await registration.pushManager.getSubscription())?.unsubscribe();
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
      }
      await saveSubscription(subscription);
      setState("on");
      return "ok" as const;
    } catch {
      return "failed" as const;
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const registration = await readyRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch(
          `/api/push-subscriptions?endpoint=${encodeURIComponent(subscription.endpoint)}`,
          { method: "DELETE", credentials: "same-origin" }
        );
        await subscription.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    setBusy(true);
    try {
      const registration = await readyRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) return "expired" as const;
      const response = await fetch("/api/push-subscriptions/test", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      if (response.ok) return "ok" as const;
      if (response.status === 404 || response.status === 410) {
        setState("off");
        return "expired" as const;
      }
      return "failed" as const;
    } catch {
      return "failed" as const;
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, enable, disable, sendTest };
}

/** What the person reads for each state, shared by desktop and phone. */
export const PUSH_COPY: Record<PushState, { title: string; desc: string }> = {
  loading: { title: "Notifications on this device", desc: "Checking…" },
  "needs-install": {
    title: "Add Needt to Home Screen first",
    desc: "On iPhone, notifications only work in the installed app: tap Share, then Add to Home Screen. Open Needt from there and come back here.",
  },
  unsupported: {
    title: "Not supported here",
    desc: "This browser cannot receive notifications. Try Chrome, Edge, Firefox or Safari 16.4 or later.",
  },
  unconfigured: {
    title: "Not available on this server",
    desc: "Push delivery is not set up here yet.",
  },
  blocked: {
    title: "Blocked in the browser",
    desc: "Notifications are turned off for Needt. Allow them in the site settings (the lock icon in the address bar; on iPhone, Settings, Notifications, Needt), then reload.",
  },
  off: {
    title: "Notifications on this device",
    desc: "Get task reminders and overdue alerts even when Needt is closed.",
  },
  on: {
    title: "Notifications are on",
    desc: "This device gets reminders and alerts even when Needt is closed.",
  },
};
