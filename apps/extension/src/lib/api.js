// @ts-check
/**
 * Talking to Needt with a personal token (Settings -> Personal API). Every
 * call goes through the service worker or an extension page, so the host
 * permission covers it and no cookie is used.
 */

export const DEFAULT_BASE_URL = "https://use.needt.app";

/** @returns {Promise<{ baseUrl: string, token: string }>} */
export async function getSettings() {
  const { baseUrl, token } = await chrome.storage.local.get(["baseUrl", "token"]);
  return { baseUrl: (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ""), token: token || "" };
}

export class NeedtError extends Error {
  /** @param {number} status @param {string} message @param {string} [code] */
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown }} [options]
 */
export async function api(path, options = {}) {
  const { baseUrl, token } = await getSettings();
  if (!token) throw new NeedtError(401, "Connect Needt in the extension options");
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { error: text };
  }
  if (!response.ok) {
    throw new NeedtError(
      response.status,
      payload?.error?.toString?.() || `Needt answered ${response.status}`,
      payload?.code
    );
  }
  return payload;
}

/** Open projects, for the project picker: [{ id, name, color }]. */
export async function listProjects() {
  const payload = await api("/api/extension/projects");
  return payload?.projects ?? [];
}

/** The person's day and local date key, for the snooze budget. */
export function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}
