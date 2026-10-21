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
