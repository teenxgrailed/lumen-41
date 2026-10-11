export const OFFLINE_SCHEMA_VERSION = 2;

export interface NeedtOfflineScope {
  userId: string;
  workspaceId: string;
  schemaVersion: typeof OFFLINE_SCHEMA_VERSION;
}

async function activeWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  return (
    navigator.serviceWorker.controller ||
    registration?.active ||
    registration?.waiting ||
    null
  );
}

export async function setNeedtOfflineScope(
  scope: Omit<NeedtOfflineScope, "schemaVersion">
) {
  const worker = await activeWorker();
  if (!worker) return;
  await postWithAck(worker, {
    type: "NEEDT_SET_OFFLINE_SCOPE",
    scope: { ...scope, schemaVersion: OFFLINE_SCHEMA_VERSION },
  });
}

async function postWithAck(
  worker: ServiceWorker,
  message: unknown,
  timeoutMs = 1500
): Promise<boolean> {
  if (typeof MessageChannel === "undefined") return false;
  return new Promise<boolean>((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => resolve(false), timeoutMs);
    channel.port1.onmessage = () => {
      window.clearTimeout(timeout);
      resolve(true);
    };
    worker.postMessage(message, [channel.port2]);
  });
}

/**
 * The only keys that survive a sign-out: they describe the device, not the
 * person. Everything else in localStorage is treated as the signed-in user's,
 * so a store added later is cleared without anyone remembering to list it.
 */
export const DEVICE_PREFERENCE_KEYS: ReadonlySet<string> = new Set([
  "theme",
  "needt:quick-tip:last-shown-at",
  "needt:quick-tip:next-index",
]);

/**
 * `calendar-settings` holds the whole settings store, but the pre-paint theme
 * script reads the theme from it. It is cut down to the theme, which the
 * store's own `merge` fills back out with defaults.
 */
const SETTINGS_STORE_KEY = "calendar-settings";

function themeOnlySettings(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      state?: { user?: { theme?: unknown; systemTheme?: unknown } };
      version?: number;
    };
    const user = parsed?.state?.user;
    if (!user || (user.theme === undefined && user.systemTheme === undefined)) {
      return null;
    }
    return JSON.stringify({
      state: { user: { theme: user.theme, systemTheme: user.systemTheme } },
      version: parsed.version,
    });
  } catch {
    return null;
  }
}

export function clearUserScopedStorage(storage: Storage) {
  const settings = themeOnlySettings(storage.getItem(SETTINGS_STORE_KEY));
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && !DEVICE_PREFERENCE_KEYS.has(key)) storage.removeItem(key);
  }
  if (settings) storage.setItem(SETTINGS_STORE_KEY, settings);
}

function clearUserStorage() {
  if (typeof window === "undefined") return;
  try {
    clearUserScopedStorage(window.localStorage);
  } catch {
    // Blocked storage holds nothing to clear.
  }
}

export async function clearNeedtOfflineData() {
  clearUserStorage();
  const worker = await activeWorker();
  if (!worker) return;
  await postWithAck(worker, { type: "NEEDT_CLEAR_OFFLINE_DATA" });
}

export const SIGN_OUT_SYNC_TIMEOUT_MS = 3000;

/**
 * Gives changes saved offline one short chance to reach the server, then
 * clears the device. Clearing also empties the offline queue, so whatever the
 * sync could not send in time is lost; that is the price of leaving nothing
 * of the account behind on a shared device.
 */
export async function prepareNeedtSignOut(
  timeoutMs = SIGN_OUT_SYNC_TIMEOUT_MS
) {
  try {
    const worker = await activeWorker();
    if (worker) {
      await postWithAck(worker, { type: "NEEDT_SYNC_NOW" }, timeoutMs);
    }
  } catch {
    // A worker that cannot sync must not keep the person signed in.
  }
  await clearNeedtOfflineData();
}
