/**
 * Bridge to the native iOS shell (apps/ios, a Capacitor wrapper that loads this
 * web app by URL). In a browser every function here is a no-op, so call sites
 * never need to check where they run.
 *
 * The shell injects `window.Capacitor` and exposes each native plugin on
 * `window.Capacitor.Plugins`; this file does not bundle `@capacitor/*`.
 */
import type { ResolvedThemeMode } from "@/types/settings";

type PluginFn = (...args: never[]) => Promise<unknown>;
type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, Record<string, PluginFn> | undefined>;
};

function capacitor(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap ?? null;
}

/** True only inside the native shell. */
export function isNativeApp(): boolean {
  const cap = capacitor();
  try {
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

async function call(
  plugin: string,
  method: string,
  arg?: unknown
): Promise<unknown> {
  if (!isNativeApp()) return undefined;
  const fn = capacitor()?.Plugins?.[plugin]?.[method] as
    | ((a?: unknown) => Promise<unknown>)
    | undefined;
  if (!fn) return undefined;
  try {
    return await fn(arg);
  } catch {
    // a native call must never break the screen that asked for it
    return undefined;
  }
}

/** True inside the iOS shell (not the desktop app, not a browser). */
export function isIosApp(): boolean {
  if (!isNativeApp()) return false;
  try {
    return capacitor()?.getPlatform?.() === "ios";
  } catch {
    return false;
  }
}

/**
 * True when this window is a store build: the iOS shell (every iOS build ships
 * through the App Store) or the Mac App Store build of the Mac app, whose shell
 * injects `window.__needtNative = { platform: "mac-swift", distribution:
 * "appstore" }` before the page runs. The direct-download Mac build reports
 * `distribution: "direct"` (or nothing) and keeps its purchase screens.
 *
 * In a store build the page shows no price, no checkout, no "Upgrade", no
 * trial-with-card step and no link to the pricing or landing page (App Store
 * Review Guidelines 3.1.1 and 3.1.3(f)). Pro is unlocked by the account alone.
 * False on the server and in every browser tab.
 */
export function isStoreDistribution(): boolean {
  if (typeof window === "undefined") return false;
  if (isIosApp()) return true;
  try {
    const native = (
      window as unknown as { __needtNative?: { distribution?: unknown } }
    ).__needtNative;
    return native?.distribution === "appstore";
  } catch {
    return false;
  }
}

export type NativeAuthResult =
  | { ok: true; url: string }
  | { ok: false; reason: "cancelled" | "unavailable" | "failed" };

/**
 * Runs `url` in the system's authentication sheet (the `NeedtAuth` plugin,
 * ASWebAuthenticationSession) and resolves with the link it came back to
 * (`needt://auth?code=...`). Unlike `call`, the reason for a failure matters
 * here: closing the sheet is not an error the person needs to be told about.
 */
export async function runNativeAuthSession(
  url: string,
  callbackScheme: string
): Promise<NativeAuthResult> {
  const fn = capacitor()?.Plugins?.NeedtAuth?.start as
    | ((a: unknown) => Promise<{ url?: string }>)
    | undefined;
  if (!isIosApp() || !fn) return { ok: false, reason: "unavailable" };
  try {
    const result = await fn({ url, callbackScheme });
    return typeof result?.url === "string"
      ? { ok: true, url: result.url }
      : { ok: false, reason: "failed" };
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    return {
      ok: false,
      reason: code === "cancelled" ? "cancelled" : "failed",
    };
  }
}

/**
 * Switch the home-screen icon (iOS alternate icons). `null` is the primary
 * icon (Midnight). Silent when the shell has no `NeedtAppIcon` plugin (the
 * Swift plugin in apps/ios/ios/App/App/NeedtPlugins.swift).
 */
export async function setNativeAppIcon(name: string | null): Promise<void> {
  await call("NeedtAppIcon", "setIcon", { name });
}

export type HapticKind = "light" | "medium" | "success" | "warning" | "error";

/** A short tap. Silent in browsers. */
export async function haptic(kind: HapticKind = "light"): Promise<void> {
  if (kind === "light" || kind === "medium") {
    await call("Haptics", "impact", {
      style: kind === "light" ? "LIGHT" : "MEDIUM",
    });
    return;
  }
  await call("Haptics", "notification", { type: kind.toUpperCase() });
}

/** Status bar text follows the theme: light text on dim/dark, dark on paper/warm. */
export async function setStatusBarForTheme(
  resolved: ResolvedThemeMode
): Promise<void> {
  const dark = resolved === "dim" || resolved === "dark";
  // Capacitor naming: Style.Dark = light text for a dark background.
  await call("StatusBar", "setStyle", { style: dark ? "DARK" : "LIGHT" });
}

/**
 * The system share sheet. Falls back to the Web Share API; resolves false when
 * neither exists.
 */
export async function share(data: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<boolean> {
  if (isNativeApp() && capacitor()?.Plugins?.Share?.share) {
    await call("Share", "share", data);
    return true;
  }
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share(data);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

type ListenerHandle = { remove?: () => unknown };
type PushPlugin = {
  checkPermissions?: () => Promise<{ receive?: string }>;
  requestPermissions?: () => Promise<{ receive?: string }>;
  register?: () => Promise<void>;
  unregister?: () => Promise<void>;
  addListener?: (
    event: string,
    listener: (data: unknown) => void
  ) => Promise<ListenerHandle> | ListenerHandle;
};

function pushPlugin(): PushPlugin | null {
  if (!isIosApp()) return null;
  return (capacitor()?.Plugins?.PushNotifications as PushPlugin) ?? null;
}

export type NativePushPermission = "granted" | "denied" | "prompt";

/** The iOS notification permission; null outside the iOS app. */
export async function nativePushPermission(): Promise<NativePushPermission | null> {
  const push = pushPlugin();
  if (!push?.checkPermissions) return null;
  try {
    const { receive } = await push.checkPermissions();
    return receive === "granted" || receive === "denied" ? receive : "prompt";
  } catch {
    return null;
  }
}

let tokenListeners: Promise<void> | null = null;
let lastToken: string | null = null;
const tokenWaiters = new Set<(token: string | null) => void>();

function listenForTokens(push: PushPlugin) {
  if (!tokenListeners) {
    tokenListeners = (async () => {
      const settle = (token: string | null) => {
        if (token) lastToken = token;
        for (const resolve of tokenWaiters) resolve(token);
        tokenWaiters.clear();
      };
      await push.addListener?.("registration", (data) => {
        const value = (data as { value?: unknown } | null)?.value;
        settle(typeof value === "string" ? value : null);
      });
      await push.addListener?.("registrationError", () => settle(null));
    })().catch(() => undefined);
  }
  return tokenListeners;
}

/**
 * Registers with APNs and resolves with this device's token (hex), or null
 * when there is no iOS app, no permission, or Apple did not answer in time.
 * Ask for permission first (`requestNativePushPermission`).
 */
export async function nativePushToken(
  timeoutMs = 10_000
): Promise<string | null> {
  const push = pushPlugin();
  if (!push?.register) return null;
  await listenForTokens(push);
  const token = new Promise<string | null>((resolve) => {
    tokenWaiters.add(resolve);
    setTimeout(() => {
      if (tokenWaiters.delete(resolve)) resolve(lastToken);
    }, timeoutMs);
  });
  try {
    await push.register();
  } catch {
    return null;
  }
  return token;
}

/** The system prompt; resolves with what the person chose. Null outside the iOS app. */
export async function requestNativePushPermission(): Promise<NativePushPermission | null> {
  const push = pushPlugin();
  if (!push?.requestPermissions) return null;
  try {
    const { receive } = await push.requestPermissions();
    return receive === "granted" || receive === "denied" ? receive : "prompt";
  } catch {
    return null;
  }
}

/** Stops APNs delivery to this install until it registers again. */
export async function unregisterNativePush(): Promise<void> {
  try {
    await pushPlugin()?.unregister?.();
  } catch {
    // nothing to undo
  }
}

/**
 * The path of `url` when it stays on this origin, else null. Parsed, not
 * pattern-matched: the URL parser drops tabs and reads `\` as `/`, so
 * "/\t/evil.example" would pass a regex and still leave the site.
 */
export function sameOriginPath(url: unknown): string | null {
  if (typeof url !== "string" || !url.startsWith("/") || url.length > 2000) {
    return null;
  }
  try {
    const origin = window.location.origin;
    const parsed = new URL(url, origin);
    return parsed.origin === origin
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : null;
  } catch {
    return null;
  }
}

/** The token this install registered with, once Apple has answered. */
export function currentNativePushToken(): string | null {
  return lastToken;
}

/**
 * Calls `open` with the same-origin path a tapped notification carries
 * (`url` in the APNs payload). Anything that is not a path inside the app is
 * dropped. Returns the cleanup; a no-op outside the iOS app.
 */
export function onNativePushTap(open: (path: string) => void): () => void {
  const push = pushPlugin();
  if (!push?.addListener) return () => undefined;
  let handle: ListenerHandle | null = null;
  let removed = false;
  void Promise.resolve(
    push.addListener("pushNotificationActionPerformed", (data) => {
      const url = (
        data as { notification?: { data?: { url?: unknown } } } | null
      )?.notification?.data?.url;
      const path = sameOriginPath(url);
      if (path) open(path);
    })
  )
    .then((h) => {
      handle = h;
      if (removed) void h?.remove?.();
    })
    .catch(() => undefined);
  return () => {
    removed = true;
    void handle?.remove?.();
  };
}
