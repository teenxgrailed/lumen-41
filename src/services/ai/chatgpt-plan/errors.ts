/**
 * What went wrong with a ChatGPT plan request, in the terms the product acts
 * on. Source: https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery
 *
 * - `limit`: `subscription_sharing_usage_limit_exceeded` (429). The app limit
 *   or the plan is used up; retrying does not help.
 * - `ineligible`: `subscription_sharing_user_not_eligible` (403).
 * - `revoked`: the refresh token is unusable (`invalid_grant`,
 *   `refresh_token_*`, `token_expired`) or the user disconnected the app.
 * - `auth`: 401 that a refresh did not fix. Credentials are kept.
 * - `unavailable`: 503 / usage or user lookup unavailable. Temporary.
 * - `unsupported`: `subscription_sharing_unsupported_capability` (400) or an
 *   unsupported route. A bug on our side, never retried as is.
 * - `other`: anything else, including a stream that ends without
 *   `response.completed`.
 */
export type ChatGptPlanFailureKind =
  | "limit"
  | "ineligible"
  | "revoked"
  | "auth"
  | "unavailable"
  | "unsupported"
  | "other";

/** Failures after which Needt AI may answer instead (see settings.ts). */
export const FALLBACK_KINDS: ReadonlySet<ChatGptPlanFailureKind> = new Set([
  "limit",
  "ineligible",
  "revoked",
  "auth",
  "unavailable",
]);

export class ChatGptPlanError extends Error {
  constructor(
    public readonly kind: ChatGptPlanFailureKind,
    message: string,
    public readonly detail: {
      status?: number;
      code?: string;
      param?: string;
      requestId?: string | null;
    } = {}
  ) {
    super(message);
    this.name = "ChatGptPlanError";
  }
}

const REFRESH_DEAD = new Set([
  "invalid_grant",
  "invalid_refresh_token",
  "token_expired",
  "refresh_token_expired",
  "refresh_token_invalidated",
  "refresh_token_reused",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** `{error:{code,param}}`, `{error:"code"}` or `{detail:"text"}`. */
export function readErrorBody(body: unknown) {
  const root = record(body);
  const nested = record(root?.error) ?? record(record(root?.response)?.error);
  const code =
    (typeof nested?.code === "string" && nested.code) ||
    (typeof root?.error === "string" && root.error) ||
    undefined;
  return {
    code,
    param: typeof nested?.param === "string" ? nested.param : undefined,
    message:
      (typeof nested?.message === "string" && nested.message) ||
      (typeof root?.detail === "string" && root.detail) ||
      undefined,
  };
}

/** A Responses error (HTTP status or `response.failed`) as a typed failure. */
export function classifyResponsesError(
  body: unknown,
  status?: number,
  requestId?: string | null
): ChatGptPlanError {
  const { code, param, message } = readErrorBody(body);
  const detail = { status, code, param, requestId };
  const text = message ?? code ?? `ChatGPT plan request failed (${status})`;

  switch (code) {
    case "subscription_sharing_usage_limit_exceeded":
      return new ChatGptPlanError("limit", text, detail);
    case "subscription_sharing_user_not_eligible":
      return new ChatGptPlanError("ineligible", text, detail);
    case "subscription_sharing_usage_unavailable":
    case "subscription_sharing_user_unavailable":
      return new ChatGptPlanError("unavailable", text, detail);
    case "subscription_sharing_unsupported_capability":
    case "subscription_sharing_route_not_supported":
      return new ChatGptPlanError("unsupported", text, detail);
    case "subscription_sharing_invalid_user":
      return new ChatGptPlanError("auth", text, detail);
    case "chatpass_v2_scope_not_authorized":
    case "chatpass_v2_invalid_authorization_context":
      return new ChatGptPlanError("ineligible", text, detail);
  }
  if (code && REFRESH_DEAD.has(code)) {
    return new ChatGptPlanError("revoked", text, detail);
  }
  if (status === 401) return new ChatGptPlanError("auth", text, detail);
  if (status === 429) return new ChatGptPlanError("limit", text, detail);
  if (status === 403) return new ChatGptPlanError("ineligible", text, detail);
  if (status === 503) return new ChatGptPlanError("unavailable", text, detail);
  return new ChatGptPlanError("other", text, detail);
}

/** An OAuth token-endpoint error (code exchange or refresh). */
export function classifyTokenError(
  body: unknown,
  status: number
): ChatGptPlanError {
  const { code, message } = readErrorBody(body);
  const text = message ?? code ?? `Token request failed (${status})`;
  if (code && REFRESH_DEAD.has(code)) {
    return new ChatGptPlanError("revoked", text, { status, code });
  }
  if (code === "invalid_client") {
    // Our configuration, not the person's connection: keep their tokens.
    return new ChatGptPlanError("other", text, { status, code });
  }
  if (status >= 500 || status === 429) {
    return new ChatGptPlanError("unavailable", text, { status, code });
  }
  return new ChatGptPlanError("other", text, { status, code });
}
