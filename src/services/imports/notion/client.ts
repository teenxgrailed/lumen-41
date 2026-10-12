import { newDate } from "@/lib/date-utils";
import { publicAppUrl } from "@/lib/public-url";

import type {
  NotionBlock,
  NotionList,
  NotionMarkdown,
  NotionTokens,
} from "./types";

/**
 * Notion over plain fetch (no SDK): the OAuth code exchange and refresh, and
 * the four reads the importer needs. The markdown endpoint only exists in the
 * newest API version, so every call carries its Notion-Version explicitly.
 *
 * Sources: https://developers.notion.com/reference/request-limits (rate
 * limits, Retry-After), /guides/get-started/authorization (OAuth, refresh
 * tokens), /reference/retrieve-page-markdown, /reference/post-search,
 * /reference/query-a-data-source.
 */

export const NOTION_VERSION = "2026-03-11";
export const NOTION_API = "https://api.notion.com";
export const NOTION_AUTHORIZE_URL = `${NOTION_API}/v1/oauth/authorize`;
export const NOTION_TOKEN_URL = `${NOTION_API}/v1/oauth/token`;

const REQUEST_TIMEOUT_MS = 60_000;
/** Notion allows an average of 3 requests a second per connection. */
export const NOTION_REQUESTS_PER_SECOND = 3;
export const NOTION_RATE_RETRIES = 5;
const SERVER_ERROR_RETRIES = 2;
const MAX_BACKOFF_SECONDS = 30;
const MAX_RETRY_AFTER_SECONDS = 60;
const JITTER_MS = 250;

export type NotionErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "unavailable"
  | "bad_response";

export class NotionApiError extends Error {
  constructor(
    public readonly code: NotionErrorCode,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "NotionApiError";
  }
}

export interface NotionOAuthConfig {
  clientId: string;
  clientSecret: string;
}

/** Null when NOTION_CLIENT_ID / NOTION_CLIENT_SECRET are not set. */
export function getNotionOAuthConfig(): NotionOAuthConfig | null {
  const clientId = process.env.NOTION_CLIENT_ID?.trim();
  const clientSecret = process.env.NOTION_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * The redirect URI registered with the Notion integration
 * (<origin>/api/imports/notion/callback). The authorize and callback routes
 * both build it here: Notion requires the two to match exactly.
 */
export function notionRedirectUri(
  request: Parameters<typeof publicAppUrl>[1]
): string {
  return publicAppUrl("/api/imports/notion/callback", request).toString();
}

export function buildNotionAuthorizeUrl(
  config: NotionOAuthConfig,
  state: string,
  redirectUri: string
): string {
  const url = new URL(NOTION_AUTHORIZE_URL);
  url.searchParams.set("owner", "user");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

/* ---------- token envelope ---------- */

/**
 * What goes (encrypted) into ImportRun.encryptedToken: the bare access token
 * when there is no refresh token, else a small JSON object holding both.
 * Notion access tokens never begin with "{", so the two cannot be confused.
 */
export function encodeNotionTokens(tokens: NotionTokens): string {
  return tokens.refreshToken
    ? JSON.stringify({ a: tokens.accessToken, r: tokens.refreshToken })
    : tokens.accessToken;
}

export function decodeNotionTokens(stored: string): NotionTokens {
  if (stored.startsWith("{")) {
    try {
      const parsed = JSON.parse(stored) as { a?: unknown; r?: unknown };
      if (typeof parsed.a === "string" && parsed.a) {
        return {
          accessToken: parsed.a,
          refreshToken:
            typeof parsed.r === "string" && parsed.r ? parsed.r : null,
        };
      }
    } catch {
      // fall through: treated as unusable below
    }
    throw new NotionApiError(
      "unauthorized",
      "The import lost its access to Notion. Connect again and retry."
    );
  }
  return { accessToken: stored, refreshToken: null };
}

/* ---------- rate limiting ---------- */

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => newDate().getTime(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * A token bucket: `burst` requests may go at once, then one every
 * 1 / ratePerSecond seconds. Time comes from the injected clock so tests
 * never wait.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly clock: Clock,
    private readonly ratePerSecond = NOTION_REQUESTS_PER_SECOND,
    private readonly burst = NOTION_REQUESTS_PER_SECOND
  ) {
    this.tokens = burst;
    this.last = clock.now();
  }

  /** Resolves when one request may be sent. Callers are served in order. */
  take(): Promise<void> {
    const next = this.queue.then(() => this.acquire());
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async acquire(): Promise<void> {
    for (;;) {
      const now = this.clock.now();
      this.tokens = Math.min(
        this.burst,
        this.tokens + ((now - this.last) / 1000) * this.ratePerSecond
      );
      this.last = now;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const wait = Math.ceil(((1 - this.tokens) / this.ratePerSecond) * 1000);
      await this.clock.sleep(wait);
    }
  }
}

/* ---------- OAuth ---------- */

function basicAuth(config: NotionOAuthConfig) {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
}

async function postToken(
  config: NotionOAuthConfig,
  body: Record<string, string>,
  fetchImpl: typeof fetch
): Promise<NotionTokens> {
  let response: Response;
  try {
    response = await fetchImpl(NOTION_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: basicAuth(config),
        "Content-Type": "application/json",
        Accept: "application/json",
        "Notion-Version": NOTION_VERSION,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new NotionApiError(
      "unavailable",
      "Could not reach Notion. Try again later."
    );
  }
  if (!response.ok) {
    throw new NotionApiError(
      response.status === 429
        ? "rate_limited"
        : response.status >= 500
          ? "unavailable"
          : "unauthorized",
      "Notion did not accept the connection. Connect again and retry.",
      response.status
    );
  }
  let json: { access_token?: unknown; refresh_token?: unknown };
  try {
    json = (await response.json()) as typeof json;
  } catch {
    throw new NotionApiError(
      "bad_response",
      "Notion sent a response that is not JSON."
    );
  }
  if (typeof json?.access_token !== "string" || !json.access_token) {
    throw new NotionApiError(
      "bad_response",
      "Notion did not return an access token."
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken:
      typeof json.refresh_token === "string" && json.refresh_token
        ? json.refresh_token
        : null,
  };
}

export function exchangeNotionCode(
  config: NotionOAuthConfig,
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch
): Promise<NotionTokens> {
  return postToken(
    config,
    { grant_type: "authorization_code", code, redirect_uri: redirectUri },
    fetchImpl
  );
}

export function refreshNotionTokens(
  config: NotionOAuthConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<NotionTokens> {
  return postToken(
    config,
    { grant_type: "refresh_token", refresh_token: refreshToken },
    fetchImpl
  );
}

/* ---------- API client ---------- */

export interface NotionClientOptions {
  tokens: NotionTokens;
  /** Needed only to refresh an expired access token. */
  oauth?: NotionOAuthConfig | null;
  fetchImpl?: typeof fetch;
  clock?: Clock;
  random?: () => number;
}

function errorForStatus(status: number): NotionApiError {
  if (status === 401) {
    return new NotionApiError(
      "unauthorized",
      "Notion did not accept the access. Connect again and retry.",
      status
    );
  }
  if (status === 403) {
    return new NotionApiError(
      "forbidden",
      "Notion refused access to this content. Check the connection can read content.",
      status
    );
  }
  if (status === 404) {
    return new NotionApiError(
      "not_found",
      "Notion could not find that page, or it is not shared with the connection.",
      status
    );
  }
  if (status === 429 || status === 529) {
    return new NotionApiError(
      "rate_limited",
      "Notion is limiting requests right now. Try again in a few minutes.",
      status
    );
  }
  if (status >= 500) {
    return new NotionApiError(
      "unavailable",
      "Notion is not responding. Try again later.",
      status
    );
  }
  return new NotionApiError(
    "bad_response",
    `Notion answered with an unexpected status (${status}).`,
    status
  );
}

export class NotionClient {
  private tokens: NotionTokens;
  private readonly oauth: NotionOAuthConfig | null;
  private readonly fetchImpl: typeof fetch;
  private readonly clock: Clock;
  private readonly random: () => number;
  private readonly bucket: TokenBucket;
  private refreshing: Promise<void> | null = null;

  constructor(options: NotionClientOptions) {
    this.tokens = { ...options.tokens };
    this.oauth = options.oauth ?? null;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.clock = options.clock ?? systemClock;
    this.random = options.random ?? Math.random;
    this.bucket = new TokenBucket(this.clock);
  }

  private async refreshOnce(): Promise<boolean> {
    if (!this.tokens.refreshToken || !this.oauth) return false;
    const refreshToken = this.tokens.refreshToken;
    const oauth = this.oauth;
    this.refreshing ??= refreshNotionTokens(oauth, refreshToken, this.fetchImpl)
      .then((next) => {
        this.tokens = next;
      })
      .finally(() => {
        this.refreshing = null;
      });
    await this.refreshing;
    return true;
  }

  private retryDelayMs(attempt: number, retryAfter: string | null): number {
    const header = retryAfter === null ? NaN : Number(retryAfter);
    const seconds =
      Number.isFinite(header) && header >= 0
        ? Math.min(header, MAX_RETRY_AFTER_SECONDS)
        : Math.min(2 ** attempt, MAX_BACKOFF_SECONDS);
    return seconds * 1000 + this.random() * JITTER_MS;
  }

  /**
   * One API call: paced by the token bucket, retried on 429/529 (waiting out
   * Retry-After, bounded) and on transient 5xx (every call here is a read),
   * and refreshed once on a 401 when a refresh token is on hand.
   */
  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown
  ): Promise<T> {
    let rateRetries = 0;
    let serverRetries = 0;
    let refreshed = false;
    for (;;) {
      await this.bucket.take();
      let response: Response;
      try {
        response = await this.fetchImpl(`${NOTION_API}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.tokens.accessToken}`,
            "Notion-Version": NOTION_VERSION,
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        if (serverRetries < SERVER_ERROR_RETRIES) {
          serverRetries += 1;
          await this.clock.sleep(this.retryDelayMs(serverRetries, null));
          continue;
        }
        throw new NotionApiError(
          "unavailable",
          "Could not reach Notion. Try again later."
        );
      }

      if (response.ok) {
        try {
          return (await response.json()) as T;
        } catch {
          throw new NotionApiError(
            "bad_response",
            "Notion sent a response that is not JSON."
          );
        }
      }

      if (response.status === 401 && !refreshed) {
        refreshed = true;
        if (await this.refreshOnce()) continue;
      }
      if (response.status === 429 || response.status === 529) {
        const blocked = await response
          .clone()
          .json()
          .then(
            (json: { additional_data?: { rate_limit_reason?: string } }) =>
              json?.additional_data?.rate_limit_reason ===
              "public_api_request_blocked"
          )
          .catch(() => false);
        if (!blocked && rateRetries < NOTION_RATE_RETRIES) {
          const wait = this.retryDelayMs(
            rateRetries,
            response.headers.get("retry-after")
          );
          rateRetries += 1;
          await this.clock.sleep(wait);
          continue;
        }
      }
      if (
        [500, 502, 503, 504].includes(response.status) &&
        serverRetries < SERVER_ERROR_RETRIES
      ) {
        serverRetries += 1;
        await this.clock.sleep(this.retryDelayMs(serverRetries, null));
        continue;
      }
      throw errorForStatus(response.status);
    }
  }

  /** One page of search results (pages or data sources shared with the connection). */
  search(kind: "page" | "data_source", cursor?: string): Promise<NotionList> {
    return this.request<NotionList>("POST", "/v1/search", {
      filter: { property: "object", value: kind },
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
  }

  /** One page of rows of a data source. */
  queryDataSource(id: string, cursor?: string): Promise<NotionList> {
    return this.request<NotionList>(
      "POST",
      `/v1/data_sources/${encodeURIComponent(id)}/query`,
      { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }
    );
  }

  /** A page's body as enhanced markdown (also accepts unknown_block_ids). */
  getPageMarkdown(id: string): Promise<NotionMarkdown> {
    return this.request<NotionMarkdown>(
      "GET",
      `/v1/pages/${encodeURIComponent(id)}/markdown`
    );
  }

  getBlock(id: string): Promise<NotionBlock> {
    return this.request<NotionBlock>(
      "GET",
      `/v1/blocks/${encodeURIComponent(id)}`
    );
  }
}
