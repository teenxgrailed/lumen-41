"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  currentNativePushToken,
  isIosApp,
  nativePushPermission,
  nativePushToken,
  requestNativePushPermission,
  unregisterNativePush,
} from "@/lib/native";

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
 *
 * Inside the iOS app the same states come from APNs instead (the WebView has
 * no Push API): the system permission, and a device token saved through
 * `/api/push-subscriptions/native`. `unconfigured` then means the server has
 * no APNs key.
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
    Boolean(navigator.serviceWorker) &&
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
  /** True inside the iOS app, where this is APNs and not Web Push. */
  native: boolean;
  busy: boolean;
  /** Must be called from a click: iOS only shows the prompt from a gesture. */
  enable: () => Promise<"ok" | "denied" | "failed">;
  disable: () => Promise<void>;
  sendTest: () => Promise<"ok" | "expired" | "failed">;
};

export function usePushNotifications(): PushController {
  // Not rendered, so the server's `false` here cannot mismatch.
  const [native] = useState(() => typeof window !== "undefined" && isIosApp());
  const web = useWebPush(!native);
  const app = useNativePush(native);
  return native ? app : web;
}

function useWebPush(active: boolean): PushController {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const config = useRef<ServerConfig | null>(null);

  const refresh = useCallback(async () => {
    if (!active) return;
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
  }, [active]);

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

  return { state, busy, native: false, enable, disable, sendTest };
}

/** Set when the person turned notifications off here; the permission stays. */
const NATIVE_OFF_KEY = "needt.push.native.off";

function nativeOptedOut() {
  try {
    return localStorage.getItem(NATIVE_OFF_KEY) === "1";
  } catch {
    return false;
  }
}

function setNativeOptedOut(off: boolean) {
  try {
    if (off) localStorage.setItem(NATIVE_OFF_KEY, "1");
    else localStorage.removeItem(NATIVE_OFF_KEY);
  } catch {
    // private storage: the switch only lasts this session
  }
}

async function nativeConfigured() {
  const response = await fetch("/api/push-subscriptions/native", {
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("config");
  return (
    ((await response.json()) as { configured?: boolean }).configured === true
  );
}

async function saveNativeToken(token: string) {
  const response = await fetch("/api/push-subscriptions/native", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform: "ios" }),
  });
  if (!response.ok) throw new Error("save");
}

/**
 * At app start: when notifications are allowed and not turned off here,
 * register again and save the token, which Apple may have changed. Returns
 * the token, or null when nothing was saved.
 */
export async function syncNativePushToken(): Promise<string | null> {
  if (!isIosApp() || nativeOptedOut()) return null;
  if ((await nativePushPermission()) !== "granted") return null;
  const token = await nativePushToken();
  if (!token) return null;
  await saveNativeToken(token);
  return token;
}

/**
 * Signing out: this phone stops getting the account's notifications, so a
 * shared phone's lock screen does not keep showing them. Bounded, because it
 * must never hold the sign-out up; the next account to sign in here saves the
 * token again for itself.
 */
export async function releaseNativePushToken(): Promise<void> {
  const token = currentNativePushToken();
  if (!token) return;
  // Written before the request, so an app killed mid-request still retries.
  setPendingRelease(token);
  if (await deleteNativeToken(token)) setPendingRelease(null);
}

/** A release that did not reach the server, kept for the next launch. */
const NATIVE_RELEASE_KEY = "needt.push.native.release";

function pendingRelease(): string | null {
  try {
    return localStorage.getItem(NATIVE_RELEASE_KEY);
  } catch {
    return null;
  }
}

function setPendingRelease(token: string | null) {
  try {
    if (token) localStorage.setItem(NATIVE_RELEASE_KEY, token);
    else localStorage.removeItem(NATIVE_RELEASE_KEY);
  } catch {
    // private storage: the stale-token sweep on the server is the fallback
  }
}

async function deleteNativeToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/push-subscriptions/native?token=${encodeURIComponent(token)}`,
      {
        method: "DELETE",
        credentials: "same-origin",
        signal: AbortSignal.timeout(3000),
      }
    );
    // 204 removed it (or it was already gone); 401 means the session ended
    // first, and only the stale sweep or the next sign-in can undo that.
    return response.ok || response.status === 401;
  } catch {
    return false;
  }
}

/**
 * At launch, before the token is saved again: a release that failed at the
 * last sign-out is sent now. Signed in as the same person, the token is then
 * saved again if they still allow notifications; signed in as someone else,
 * the release finds nothing of theirs and the save rebinds the token.
 */
export async function retryPendingNativeRelease(): Promise<void> {
  const token = pendingRelease();
  if (!token) return;
  if (await deleteNativeToken(token)) setPendingRelease(null);
}

function useNativePush(active: boolean): PushController {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const token = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!active) return;
    try {
      if (!(await nativeConfigured())) return setState("unconfigured");
    } catch {
      return setState("off");
    }
    const permission = await nativePushPermission();
    if (permission === "denied") return setState("blocked");
    if (permission !== "granted" || nativeOptedOut()) return setState("off");
    try {
      token.current = await syncNativePushToken();
    } catch {
      token.current = null;
    }
    setState(token.current ? "on" : "off");
  }, [active]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    const permission = await requestNativePushPermission();
    if (permission !== "granted") {
      setState(permission === "denied" ? "blocked" : "off");
      return "denied" as const;
    }
    setBusy(true);
    try {
      setNativeOptedOut(false);
      const next = await nativePushToken();
      if (!next) return "failed" as const;
      await saveNativeToken(next);
      token.current = next;
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
      const current = token.current;
      if (current) {
        await fetch(
          `/api/push-subscriptions/native?token=${encodeURIComponent(current)}`,
          { method: "DELETE", credentials: "same-origin" }
        );
      }
      setNativeOptedOut(true);
      await unregisterNativePush();
      token.current = null;
      setState("off");
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    setBusy(true);
    try {
      const current = token.current;
      if (!current) return "expired" as const;
      const response = await fetch("/api/push-subscriptions/test", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: current }),
      });
      if (response.ok) return "ok" as const;
      if (response.status === 404 || response.status === 410) {
        token.current = null;
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

  return { state, busy, native: true, enable, disable, sendTest };
}

/** The iOS app's wording where the browser's would be wrong. */
export const NATIVE_PUSH_COPY: Partial<
  Record<PushState, { title: string; desc: string }>
> = {
  blocked: {
    title: "Turned off in iOS Settings",
    desc: "Notifications are off for Needt. Allow them in Settings, Notifications, Needt, then come back here.",
  },
  unconfigured: {
    title: "Not available yet",
    desc: "Notifications in the app are not set up on the server yet.",
  },
};

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
