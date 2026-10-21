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

/**
 * Asks for notification permission and asks the OS to register with APNs.
 * Resolves true when registration was requested (false in a browser or when
 * permission is denied). The device token arrives later on the plugin's
 * "registration" event.
 *
 * //todo APNs needs the paid Apple Developer account (push entitlement and an
 * APNs key). Until then registration cannot succeed; nothing calls this yet and
 * web push stays as it is. After the account exists, send the token to the
 * server and let the worker deliver through APNs.
 */
export async function registerNativePush(): Promise<boolean> {
  if (!isNativeApp()) return false;
  const push = capacitor()?.Plugins?.PushNotifications;
  if (!push) return false;
  try {
    const perm = (await call("PushNotifications", "requestPermissions")) as
      | { receive?: string }
      | undefined;
    if (perm?.receive !== "granted") return false;
    await call("PushNotifications", "register");
    return true;
  } catch {
    return false;
  }
}
