import { sanitizeLogText } from "@/lib/logger/sanitize";

/** Short fixed codes stored in MailAccount.syncError. Never provider text. */
export const MAIL_SYNC_ERROR_AUTH = "auth";
export const MAIL_SYNC_ERROR_TOKEN = "token_unavailable";

/** The sign-in is gone: revoked grant, missing connection, IMAP login refused. */
export class MailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailAuthError";
  }
}

/**
 * No access token could be produced. The token manager returns null for a
 * revoked grant and for a network blip alike, so this alone is not proof.
 */
export class MailTokenUnavailableError extends Error {
  constructor() {
    super("Mail OAuth token is unavailable.");
    this.name = "MailTokenUnavailableError";
  }
}

export type MailSyncFailureKind = "auth" | "token-unavailable" | "transient";

function field(error: object, key: string): unknown {
  return (error as Record<string, unknown>)[key];
}

/**
 * auth: retrying cannot help (invalid_grant, HTTP 401, IMAP login refused).
 * token-unavailable: probably auth, but could be transient; the caller waits
 * for a second failed run. Everything else keeps the normal retry/backoff.
 */
export function classifyMailSyncError(error: unknown): MailSyncFailureKind {
  if (error instanceof MailAuthError) return "auth";
  if (error instanceof MailTokenUnavailableError) return "token-unavailable";
  if (!error || typeof error !== "object") return "transient";
  if (
    field(error, "name") === "MailProviderError" &&
    field(error, "status") === 401
  ) {
    return "auth";
  }
  // imapflow marks a refused login on the error itself.
  if (
    field(error, "authenticationFailed") === true ||
    field(error, "serverResponseCode") === "AUTHENTICATIONFAILED" ||
    field(error, "code") === "AUTHENTICATIONFAILED"
  ) {
    return "auth";
  }
  const response = field(error, "response");
  const data =
    response && typeof response === "object"
      ? field(response, "data")
      : undefined;
  const text = [
    field(error, "message"),
    field(error, "code"),
    data && typeof data === "object" ? field(data, "error") : undefined,
  ]
    .filter((v): v is string => typeof v === "string")
    .join(" ");
  return /invalid_grant/i.test(text) ? "auth" : "transient";
}

const LONG_TOKEN = /[A-Za-z0-9_\-.~+/=]{32,}/g;
const URL_QUERY = /(https?:\/\/[^\s?]+)\?\S*/gi;

/**
 * One line that is safe to persist: whitespace collapsed, URL queries dropped,
 * token-looking strings and emails removed, cut to `max` characters.
 */
export function scrubErrorText(text: string, max = 300): string {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(URL_QUERY, "$1")
    .replace(LONG_TOKEN, "[redacted]")
    .trim()
    .slice(0, max);
  return sanitizeLogText(cleaned);
}

export function summarizeError(error: unknown): {
  name: string;
  reason: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      reason: scrubErrorText(error.message),
    };
  }
  return { name: "NonError", reason: scrubErrorText(String(error)) };
}
