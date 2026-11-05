/**
 * Detection and thin bridges for the Needt desktop app (the Tauri shell in
 * `apps/desktop`). Every export is a safe no-op in a normal browser tab, on
 * the server, and in tests, so callers never need to branch.
 *
 * The shell injects `window.__TAURI__` (`app.withGlobalTauri`) and replaces
 * `window.Notification` with a native shim, so most web code needs nothing
 * from here; use these helpers only when the behaviour must differ.
 */

interface TauriNotificationApi {
  isPermissionGranted?: () => Promise<boolean>;
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
  sendNotification?: (options: {
    title: string;
    body?: string;
    /** A same-origin path the Mac app opens when the notification is clicked. */
    url?: string;
    /**
     * Names the moment (presenceTag): a shell that reads it replaces an
     * earlier notification with the same tag. Older shells ignore it.
     */
    tag?: string;
  }) => void;
  /**
   * Replace the app's scheduled habit moments with these (Mac shell 2b):
   * each fires at `at` even with the window closed. Older shells lack it.
   */
  schedule?: (items: readonly DesktopScheduled[]) => unknown;
  /** Take these tags back: pending and already shown. */
  cancel?: (tags: readonly string[]) => unknown;
}

/** A notification the desktop app shows at its time by itself. */
export interface DesktopScheduled {
  /** The identifier: a later one with the same tag replaces it. */
  tag: string;
  /** ISO instant. */
  at: string;
  title: string;
  body: string;
  /** A same-origin path the click opens. */
  url: string;
}

interface TauriGlobal {
  notification?: TauriNotificationApi;
  event?: { emit?: (name: string, payload?: unknown) => unknown };
}

function tauriGlobal(): TauriGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
}

/** True when running inside the Needt desktop app. */
export function isDesktopApp(): boolean {
  return tauriGlobal() !== undefined;
}

/**
 * True in the native Mac app (the Swift shell), the only place the Desktop
 * settings (island, quick add, widgets, Siri) apply. The shell sets
 * `window.__needtNative`; DesktopBridge also marks `<html data-desktop-shell>`.
 * False in a browser tab, on Windows and in the Tauri shell.
 */
export function isMacApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    !!(window as unknown as { __needtNative?: unknown }).__needtNative ||
    document.documentElement.dataset.desktopShell === "swift"
  );
}

/**
 * Show a native OS notification. Resolves to true when the desktop app took
 * it, false when not in the desktop app or permission is not granted, so the
 * caller can fall back to its normal path.
 */
export async function sendDesktopNotification(
  title: string,
  body?: string,
  url?: string,
  options: {
    /** Ask for permission when it is not granted yet (default). False for
     * anything not started by the person: no prompt out of nowhere. */
    ask?: boolean;
    tag?: string;
  } = {}
): Promise<boolean> {
  const api = tauriGlobal()?.notification;
  if (!api?.sendNotification) return false;
  try {
    let granted = (await api.isPermissionGranted?.()) ?? false;
    if (!granted && options.ask !== false) {
      granted = (await api.requestPermission?.()) === "granted";
    }
    if (!granted) return false;
    api.sendNotification({
      title,
      body,
      ...(url && /^\/(?!\/)/.test(url) ? { url } : {}),
      ...(options.tag ? { tag: options.tag } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

/** True when the desktop app can show notifications at a time by itself. */
export function desktopCanSchedule(): boolean {
  return typeof tauriGlobal()?.notification?.schedule === "function";
}

/** Hand the app the habit moments to show at their times (replaces the set). */
export function scheduleDesktopNotifications(
  items: readonly DesktopScheduled[]
): void {
  try {
    void Promise.resolve(tauriGlobal()?.notification?.schedule?.(items)).catch(
      () => undefined
    );
  } catch {
    /* an older shell: the live path covers it while the window is open */
  }
}

/** Take notifications back by tag (pending and shown). */
export function cancelDesktopNotifications(tags: readonly string[]): void {
  if (!tags.length) return;
  try {
    void Promise.resolve(tauriGlobal()?.notification?.cancel?.(tags)).catch(
      () => undefined
    );
  } catch {
    /* nothing to take back in an older shell */
  }
}

/** Whether the desktop app may show notifications (no prompt). */
export async function desktopNotificationsAllowed(): Promise<boolean> {
  try {
    return (
      (await tauriGlobal()?.notification?.isPermissionGranted?.()) === true
    );
  } catch {
    return false;
  }
}

/** Ask the desktop app's system prompt. "default" when there is none to ask. */
export async function requestDesktopNotifications(): Promise<
  "granted" | "denied" | "default"
> {
  try {
    return (
      (await tauriGlobal()?.notification?.requestPermission?.()) ?? "default"
    );
  } catch {
    return "default";
  }
}

/* ---------- the shell's bridge ---------- */

/**
 * What the app's native menu and tray ask the page to do. The shell sends a
 * plain object through `window.__needtDesktop.dispatch`; nothing else in the
 * page is reachable from it, and `parseDesktopCommand` accepts only these.
 */
export type DesktopCommand =
  | { type: "navigate"; path: string }
  | { type: "new-task" }
  | { type: "new-doc" }
  | { type: "toggle-sidebar" }
  | { type: "palette" }
  | { type: "settings" }
  | { type: "open-task"; id: string }
  /** Menu bar: pause the running focus session, or resume a paused one. */
  | { type: "focus-toggle" }
  /** Menu bar: end the running focus session. */
  | { type: "focus-end" }
  /** Menu bar: start a focus session on the next task of the day. */
  | { type: "focus-start-next" }
  /** The Mac app's APNs device token, to save for remote pushes. */
  | {
      type: "push-token";
      token: string;
      environment: "production" | "sandbox";
    };

type DesktopHost = {
  platform?: unknown;
  vibrancy?: unknown;
  setHandler?: (handler: ((command: unknown) => void) | null) => void;
};

function desktopHost(): DesktopHost | undefined {
  if (typeof window === "undefined") return undefined;
  const host = (window as unknown as { __needtDesktop?: unknown })
    .__needtDesktop;
  return host && typeof host === "object" ? (host as DesktopHost) : undefined;
}

/** "mac", "windows" or "other" inside the app; null in a browser. */
export function desktopPlatform(): "mac" | "windows" | "other" | null {
  if (!isDesktopApp()) return null;
  const platform = desktopHost()?.platform;
  return platform === "mac" || platform === "windows" ? platform : "other";
}

/**
 * True when the shell gave its window the see-through sidebar material
 * (macOS only). The web app's translucent sidebar keys on this, so a page
 * served to an older shell, or to Windows, stays opaque.
 */
export function desktopVibrancy(): boolean {
  return desktopPlatform() === "mac" && desktopHost()?.vibrancy === true;
}

const NAVIGABLE = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#]*$/;

/** A command from the shell, or null for anything that is not one. */
export function parseDesktopCommand(raw: unknown): DesktopCommand | null {
  if (!raw || typeof raw !== "object") return null;
  const { type, path, id, token, environment } = raw as Record<string, unknown>;
  switch (type) {
    case "navigate":
      return typeof path === "string" &&
        NAVIGABLE.test(path) &&
        !path.startsWith("//") &&
        path.length <= 512
        ? { type, path }
        : null;
    case "open-task":
      return typeof id === "string" && /^[\w-]{1,64}$/.test(id)
        ? { type, id }
        : null;
    case "push-token":
      return typeof token === "string" && /^[0-9a-fA-F]{64,200}$/.test(token)
        ? {
            type,
            token: token.toLowerCase(),
            environment: environment === "sandbox" ? "sandbox" : "production",
          }
        : null;
    case "new-task":
    case "new-doc":
    case "toggle-sidebar":
    case "palette":
    case "settings":
    case "focus-toggle":
    case "focus-end":
    case "focus-start-next":
      return { type };
    default:
      return null;
  }
}

/**
 * Receive the shell's commands. Commands sent before the page was ready are
 * held by the shell and delivered here. Returns the cleanup.
 */
export function onDesktopCommand(
  handler: (command: DesktopCommand) => void
): () => void {
  const host = desktopHost();
  if (!host?.setHandler) return () => undefined;
  host.setHandler((raw) => {
    const command = parseDesktopCommand(raw);
    if (command) handler(command);
  });
  return () => host.setHandler?.(null);
}

/** Tell the shell something (tray contents, signed in). No-op outside it. */
export function emitDesktopEvent(name: string, payload?: unknown): void {
  try {
    void Promise.resolve(tauriGlobal()?.event?.emit?.(name, payload)).catch(
      () => undefined
    );
  } catch {
    /* a shell without events has no tray to update */
  }
}

/**
 * True inside the native Mac app's WKWebView. Its bridge script sets
 * `window.__needtNative` before the page runs, so this is safe to read in an
 * effect (not during server render).
 */
export function isSwiftShellWindow(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as unknown as { __needtNative?: unknown }).__needtNative
  );
}
