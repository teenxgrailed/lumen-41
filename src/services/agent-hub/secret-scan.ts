import { HubError } from "./errors";

/**
 * A guard against accidents, not a security boundary: items, results and notes
 * are shared between agents, so a pasted credential must not land in them.
 * Credentials for an agent live in its own environment, never in Needt.
 *
 * The error names the field and the kind of match and never echoes the value.
 */
const PATTERNS: readonly [string, RegExp][] = [
  ["private key", /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/],
  ["Needt token", /\bneedt_(?:agent_)?[A-Za-z0-9_-]{32,}/],
  ["AWS access key id", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  [
    "access token",
    /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}/,
  ],
  ["Stripe key", /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["API key", /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/],
  [
    "JSON web token",
    /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  ],
  [
    "authorization header",
    /\bauthorization\s*[:=]\s*["']?bearer\s+[A-Za-z0-9._~+/-]{20,}/i,
  ],
  ["password in a URL", /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i],
  [
    "password or key assignment",
    /\b(?:password|passwd|secret|token|api[_-]?key)\b["']?\s*[:=]\s*["']?[^\s"',;]{12,}/i,
  ],
];

/** The kind of credential `text` looks like, or null. */
export function secretKind(text: string): string | null {
  for (const [kind, pattern] of PATTERNS) {
    if (pattern.test(text)) return kind;
  }
  return null;
}

function* strings(value: unknown): Generator<string> {
  if (typeof value === "string") yield value;
  else if (Array.isArray(value)) {
    for (const entry of value) yield* strings(entry);
  } else if (value && typeof value === "object") {
    for (const entry of Object.values(value)) yield* strings(entry);
  }
}

/**
 * Throws INVALID naming the first field that holds a credential-like value.
 * `fields` maps a field name to any JSON value; nested strings are scanned.
 */
export function assertNoSecrets(fields: Record<string, unknown>): void {
  for (const [field, value] of Object.entries(fields)) {
    for (const text of strings(value)) {
      const kind = secretKind(text);
      if (kind) {
        throw new HubError(
          "INVALID",
          `The field "${field}" looks like it contains a ${kind}. Remove it: credentials stay in the agent's own environment and never go into Needt.`,
          { field, secretKind: kind }
        );
      }
    }
  }
}
