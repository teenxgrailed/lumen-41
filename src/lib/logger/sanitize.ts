import { LogEntry, LogMetadata } from "./types";

const SENSITIVE_METADATA_KEY =
  /(?:authorization|body|content|cookie|detail|email|html|mail|message|page|password|payload|request|response|secret|subject|text|token|url)/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SECRET_VALUE_PATTERN =
  /\b((?:access[ _-]?token|api[ _-]?key|authorization|password|secret|token)\s*[=:]\s*)[^\s,;]+/gi;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[^\s,;]+/gi;
const URL_QUERY_PATTERN = /(https?:\/\/[^\s?#]+)\?[^\s]*/gi;
const LONG_OPAQUE_TOKEN_PATTERN = /[A-Za-z0-9_\-.]{32,}/g;
const MAX_LOG_TEXT_LENGTH = 512;
const MAX_STACK_LINES = 5;

// Keys that describe why something failed. They are matched before the
// content-key filter so `errorMessage` is not dropped by the `message` rule.
// Plain `message` stays dropped: in this codebase it is also used for
// mail/chat/user message content, so it is not safe to persist.
const ERROR_TEXT_KEYS = new Set([
  "error",
  "errorMessage",
  "errorName",
  "reason",
  "cause",
  "code",
  "stack",
]);
const MAX_METADATA_DEPTH = 4;

type SanitizedMetadataValue = string | number | boolean | null | string[];

function redactSecrets(value: string): string {
  return value
    .replace(EMAIL_PATTERN, "[redacted email]")
    .replace(SECRET_VALUE_PATTERN, "$1[redacted]")
    .replace(BEARER_TOKEN_PATTERN, "Bearer [redacted]")
    .replace(URL_QUERY_PATTERN, "$1?[redacted]")
    .replace(LONG_OPAQUE_TOKEN_PATTERN, "[redacted token]");
}

export function sanitizeLogText(value: string): string {
  if (value.length > MAX_LOG_TEXT_LENGTH || /[\r\n]/.test(value)) {
    return "[redacted text]";
  }

  return redactSecrets(value);
}

/**
 * Error-describing text: keeps the reason a job failed. Newlines collapse to
 * " | " and the text is truncated instead of being replaced wholesale.
 * Secrets are redacted before truncation so a cut cannot split a pattern.
 */
export function sanitizeErrorText(value: string, maxLines?: number): string {
  let lines = value.split(/\r?\n/);
  if (maxLines !== undefined) lines = lines.slice(0, maxLines);
  const redacted = redactSecrets(
    lines
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" | ")
  );
  return redacted.length > MAX_LOG_TEXT_LENGTH
    ? `${redacted.slice(0, MAX_LOG_TEXT_LENGTH - 1)}…`
    : redacted;
}

function errorToText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  return undefined;
}

function sanitizeErrorValue(
  key: string,
  value: unknown
): SanitizedMetadataValue | undefined {
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = errorToText(value);
  if (text === undefined) return undefined;
  return sanitizeErrorText(text, key === "stack" ? MAX_STACK_LINES : undefined);
}

function sanitizeMetadataValue(
  value: unknown,
  depth: number
): SanitizedMetadataValue | undefined {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "string") return sanitizeLogText(value);
  if (depth >= MAX_METADATA_DEPTH) return "[redacted nested value]";
  if (Array.isArray(value)) {
    if (!value.every((item) => typeof item === "string")) return undefined;
    return value.map(sanitizeLogText);
  }
  return undefined;
}

export function sanitizeLogMetadata(
  metadata: Record<string, unknown> | undefined,
  depth = 0
): LogMetadata {
  if (!metadata) return {};

  return Object.fromEntries(
    Object.entries(metadata).flatMap(([key, value]) => {
      if (ERROR_TEXT_KEYS.has(key)) {
        const text = sanitizeErrorValue(key, value);
        return text === undefined ? [] : [[key, text]];
      }
      if (SENSITIVE_METADATA_KEY.test(key)) return [];
      const sanitized = sanitizeMetadataValue(value, depth);
      return sanitized === undefined ? [] : [[key, sanitized]];
    })
  ) as LogMetadata;
}

export function sanitizeLogEntry(entry: LogEntry): LogEntry {
  return {
    ...entry,
    message: sanitizeLogText(entry.message),
    metadata: sanitizeLogMetadata(entry.metadata),
  };
}
