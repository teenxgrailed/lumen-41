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
  sendNotification?: (options: { title: string; body?: string }) => void;
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
 * Show a native OS notification. Resolves to true when the desktop app took
 * it, false when not in the desktop app or permission is not granted, so the
 * caller can fall back to its normal path.
 */
export async function sendDesktopNotification(
  title: string,
  body?: string
): Promise<boolean> {
  const api = tauriGlobal()?.notification;
  if (!api?.sendNotification) return false;
  try {
    let granted = (await api.isPermissionGranted?.()) ?? false;
    if (!granted) {
      granted = (await api.requestPermission?.()) === "granted";
    }
    if (!granted) return false;
    api.sendNotification({ title, body });
    return true;
  } catch {
    return false;
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
  | { type: "open-task"; id: string };

type DesktopHost = {
  platform?: unknown;
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

const NAVIGABLE = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#]*$/;

/** A command from the shell, or null for anything that is not one. */
export function parseDesktopCommand(raw: unknown): DesktopCommand | null {
  if (!raw || typeof raw !== "object") return null;
  const { type, path, id } = raw as Record<string, unknown>;
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
    case "new-task":
    case "new-doc":
    case "toggle-sidebar":
    case "palette":
    case "settings":
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
