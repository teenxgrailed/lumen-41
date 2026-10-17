import { newDate } from "@/lib/date-utils";
import { publicAppUrl } from "@/lib/public-url";

/**
 * Pinterest API v5 over plain fetch: the OAuth code exchange and refresh, the
 * signed-in person's account, their boards and a board's Pins. Read-only.
 *
 * Sources (read 2026-10-16):
 *  - https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/
 *    (authorize URL, Basic auth on /v5/oauth/token, continuous refresh token)
 *  - https://developers.pinterest.com/docs/key-concepts/access-tiers/
 *  - https://developers.pinterest.com/docs/reference/rate-limits/
 *  - https://developers.pinterest.com/docs/changelog/changelog/#pinner-data-access-denial-error
 */

export const PINTEREST_API = "https://api.pinterest.com/v5";
export const PINTEREST_AUTHORIZE_URL = "https://www.pinterest.com/oauth/";
/** Read-only: the person's public boards and their Pins. Nothing can be written. */
export const PINTEREST_SCOPES = ["boards:read", "pins:read"] as const;

const REQUEST_TIMEOUT_MS = 20_000;

export type PinterestErrorCode =
  | "unauthorized" // token refused: reconnect
  | "forbidden" // scope missing
  | "access_denied" // PINNER_DATA_ACCESS_DENIED: the app lacks Pinterest's approval
  | "not_found"
  | "rate_limited"
  | "unavailable"
  | "bad_response";

export class PinterestApiError extends Error {
  constructor(
    public readonly code: PinterestErrorCode,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "PinterestApiError";
  }
}

export interface PinterestOAuthConfig {
  clientId: string;
  clientSecret: string;
}

/** Null when PINTEREST_CLIENT_ID / PINTEREST_CLIENT_SECRET are not set. */
export function getPinterestOAuthConfig(): PinterestOAuthConfig | null {
  const clientId = process.env.PINTEREST_CLIENT_ID?.trim();
  const clientSecret = process.env.PINTEREST_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * The redirect URI registered on the Pinterest app
 * (<origin>/api/pinterest/callback). Authorize and callback both build it
 * here: Pinterest requires an exact match.
 */
export function pinterestRedirectUri(
  request: Parameters<typeof publicAppUrl>[1]
): string {
  return publicAppUrl("/api/pinterest/callback", request).toString();
}

export function buildPinterestAuthorizeUrl(
  config: PinterestOAuthConfig,
  state: string,
  redirectUri: string
): string {
  const url = new URL(PINTEREST_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", PINTEREST_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

/* ---------- tokens ---------- */

export interface PinterestTokens {
  accessToken: string;
  refreshToken: string | null;
  accessExpiresAt: Date;
  refreshExpiresAt: Date | null;
  scope: string | null;
}

interface TokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  refresh_token_expires_in?: unknown;
  refresh_token_expires_at?: unknown;
  scope?: unknown;
}

async function tokenRequest(
  config: PinterestOAuthConfig,
  body: Record<string, string>
): Promise<PinterestTokens> {
  const basic = Buffer.from(
    `${config.clientId}:${config.clientSecret}`
  ).toString("base64");
  let response: Response;
  try {
    response = await fetch(`${PINTEREST_API}/oauth/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${basic}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new PinterestApiError(
      "unavailable",
      "Pinterest could not be reached."
    );
  }
  if (response.status === 400 || response.status === 401) {
    throw new PinterestApiError(
      "unauthorized",
      "Pinterest refused the sign-in. Connect again.",
      response.status
    );
  }
  if (response.status === 429) {
    throw new PinterestApiError(
      "rate_limited",
      "Pinterest is busy. Try again in a moment.",
      429
    );
  }
  if (!response.ok) {
    throw new PinterestApiError(
      "unavailable",
      `Pinterest answered ${response.status}.`,
      response.status
    );
  }
  const json = (await response
    .json()
    .catch(() => null)) as TokenResponse | null;
  if (!json || typeof json.access_token !== "string" || !json.access_token) {
    throw new PinterestApiError(
      "bad_response",
      "Pinterest sent an unexpected answer."
    );
  }
  const now = newDate().getTime();
  const seconds = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
  const refreshAt =
    typeof json.refresh_token_expires_at === "number"
      ? json.refresh_token_expires_at * 1000
      : typeof json.refresh_token_expires_in === "number"
        ? now + json.refresh_token_expires_in * 1000
        : null;
  return {
    accessToken: json.access_token,
    refreshToken:
      typeof json.refresh_token === "string" && json.refresh_token
        ? json.refresh_token
        : null,
    // Pinterest access tokens last 30 days (2592000 s).
    accessExpiresAt: new Date(now + seconds(json.expires_in, 2_592_000) * 1000),
    refreshExpiresAt: refreshAt === null ? null : new Date(refreshAt),
    scope: typeof json.scope === "string" ? json.scope : null,
  };
}

export function exchangePinterestCode(
  config: PinterestOAuthConfig,
  code: string,
  redirectUri: string
) {
  return tokenRequest(config, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    continuous_refresh: "true",
  });
}

export function refreshPinterestTokens(
  config: PinterestOAuthConfig,
  refreshToken: string
) {
  return tokenRequest(config, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

/* ---------- reads ---------- */

async function get<T>(
  token: string,
  path: string,
  query: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${PINTEREST_API}${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new PinterestApiError(
      "unavailable",
      "Pinterest could not be reached."
    );
  }
  if (response.status === 401) {
    throw new PinterestApiError(
      "unauthorized",
      "Pinterest access ended. Connect again.",
      401
    );
  }
  if (response.status === 403) {
    const body = (await response.json().catch(() => null)) as {
      message?: unknown;
      code?: unknown;
    } | null;
    const text = `${String(body?.message ?? "")} ${String(body?.code ?? "")}`;
    if (/PINNER_DATA_ACCESS_DENIED/i.test(text)) {
      throw new PinterestApiError(
        "access_denied",
        "Pinterest has not approved this app to read your boards yet.",
        403
      );
    }
    throw new PinterestApiError(
      "forbidden",
      "Pinterest did not allow that. Connect again and accept the access.",
      403
    );
  }
  if (response.status === 404) {
    throw new PinterestApiError("not_found", "That board was not found.", 404);
  }
  if (response.status === 429) {
    throw new PinterestApiError(
      "rate_limited",
      "Pinterest is busy. Try again in a moment.",
      429
    );
  }
  if (!response.ok) {
    throw new PinterestApiError(
      "unavailable",
      `Pinterest answered ${response.status}.`,
      response.status
    );
  }
  const json = (await response.json().catch(() => null)) as T | null;
  if (json === null || typeof json !== "object") {
    throw new PinterestApiError(
      "bad_response",
      "Pinterest sent an unexpected answer."
    );
  }
  return json;
}

export interface PinterestAccount {
  username: string | null;
}

export async function getPinterestAccount(
  token: string
): Promise<PinterestAccount> {
  const json = await get<{ username?: unknown }>(token, "/user_account");
  return {
    username: typeof json.username === "string" ? json.username : null,
  };
}

export interface PinterestBoard {
  id: string;
  name: string;
  pinCount: number | null;
  privacy: string | null;
}

interface Page {
  items?: Record<string, unknown>[];
  bookmark?: string | null;
}

/** The person's boards, at most `max` (a few pages of 100). */
export async function listPinterestBoards(
  token: string,
  max = 300
): Promise<PinterestBoard[]> {
  const out: PinterestBoard[] = [];
  let bookmark: string | null = null;
  for (let page = 0; page < 3 && out.length < max; page += 1) {
    const json: Page = await get<Page>(token, "/boards", {
      page_size: "100",
      ...(bookmark ? { bookmark } : {}),
    });
    for (const b of json.items ?? []) {
      if (typeof b.id !== "string") continue;
      out.push({
        id: b.id,
        name: typeof b.name === "string" && b.name ? b.name : "Untitled board",
        pinCount: typeof b.pin_count === "number" ? b.pin_count : null,
        privacy: typeof b.privacy === "string" ? b.privacy : null,
      });
    }
    bookmark = json.bookmark ?? null;
    if (!bookmark) break;
  }
  return out.slice(0, max);
}

export interface PinterestPin {
  id: string;
  title: string | null;
  description: string | null;
  /** The Pin's own page on Pinterest. */
  pinUrl: string;
  /** Candidate pictures, best first. */
  images: { url: string; width: number | null; height: number | null }[];
}

const IMAGE_SIZES = ["1200x", "600x", "400x300", "originals"] as const;

function isHttps(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** A Pin's picture addresses from the API's `media` object. */
export function pinImages(media: unknown): PinterestPin["images"] {
  if (!media || typeof media !== "object") return [];
  const m = media as {
    images?: Record<
      string,
      { url?: unknown; width?: unknown; height?: unknown } | undefined
    >;
    cover_image_url?: unknown;
  };
  const out: PinterestPin["images"] = [];
  for (const size of IMAGE_SIZES) {
    const img = m.images?.[size];
    if (img && isHttps(img.url)) {
      out.push({
        url: img.url,
        width: typeof img.width === "number" ? img.width : null,
        height: typeof img.height === "number" ? img.height : null,
      });
    }
  }
  if (!out.length && isHttps(m.cover_image_url)) {
    out.push({ url: m.cover_image_url, width: null, height: null });
  }
  return out;
}

export interface PinsPage {
  pins: PinterestPin[];
  bookmark: string | null;
}

export async function listPinterestPins(
  token: string,
  boardId: string,
  options: { bookmark?: string | null; pageSize?: number } = {}
): Promise<PinsPage> {
  const json = await get<Page>(
    token,
    `/boards/${encodeURIComponent(boardId)}/pins`,
    {
      page_size: String(options.pageSize ?? 50),
      ...(options.bookmark ? { bookmark: options.bookmark } : {}),
    }
  );
  const pins: PinterestPin[] = [];
  for (const p of json.items ?? []) {
    if (typeof p.id !== "string" || !/^\d{1,30}$/.test(p.id)) continue;
    pins.push({
      id: p.id,
      title:
        typeof p.title === "string" && p.title.trim() ? p.title.trim() : null,
      description:
        typeof p.description === "string" && p.description.trim()
          ? p.description.trim()
          : null,
      pinUrl: `https://www.pinterest.com/pin/${p.id}/`,
      images: pinImages(p.media),
    });
  }
  return { pins, bookmark: json.bookmark ?? null };
}
