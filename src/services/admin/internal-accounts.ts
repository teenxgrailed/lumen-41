import type { Prisma, SandboxKind } from "@prisma/client";

/**
 * Which accounts are ours and not a person trying the product. The Admin
 * Overview leaves them out by default. An account is internal when any of:
 *
 * - `User.internal` is true (set by hand);
 * - it is an admin (`role = "admin"`);
 * - it is a sandbox account (`sandboxKind` is set: reviewer, public demo);
 * - its address is a QA bot account: local part starts with `qa+` (see
 *   `isQaTestEmail`);
 * - its address matches one of `INTERNAL_EMAIL_RULES`;
 * - its address is one of the owner's own addresses listed in the
 *   `INTERNAL_ACCOUNT_EMAILS` environment variable (comma separated, exact
 *   match, case-insensitive). Personal addresses live in the environment, not
 *   in the source.
 *
 * The check runs in memory over the account rows the Overview already reads.
 * The SQL equivalent is in the pull request.
 */
export type EmailRule = {
  op: "endsWith" | "startsWith" | "contains";
  /** Matched case-insensitively. */
  value: string;
  why: string;
};

export const INTERNAL_EMAIL_RULES: readonly EmailRule[] = [
  { op: "endsWith", value: "@needt.app", why: "our own domain" },
  { op: "endsWith", value: "@example.com", why: "reserved test domain" },
  { op: "endsWith", value: "@example.org", why: "reserved test domain" },
  { op: "endsWith", value: "@example.net", why: "reserved test domain" },
  { op: "endsWith", value: ".test", why: "reserved test TLD" },
  { op: "endsWith", value: ".invalid", why: "reserved test TLD" },
  { op: "endsWith", value: ".localhost", why: "reserved test TLD" },
  { op: "endsWith", value: "@mailinator.com", why: "throwaway inbox" },
  { op: "contains", value: "+test@", why: "plus-tag for tests" },
  { op: "contains", value: "+qa@", why: "plus-tag for tests" },
  { op: "contains", value: "+needt@", why: "plus-tag for our own use" },
  { op: "contains", value: "+sandbox@", why: "plus-tag for tests" },
  { op: "startsWith", value: "test@", why: "test mailbox" },
  { op: "startsWith", value: "qa@", why: "test mailbox" },
  { op: "startsWith", value: "reviewer@", why: "reviewer mailbox" },
  { op: "startsWith", value: "sandbox@", why: "sandbox mailbox" },
  { op: "startsWith", value: "demo@", why: "demo mailbox" },
  { op: "startsWith", value: "bot@", why: "bot mailbox" },
  { op: "startsWith", value: "agent@", why: "agent mailbox" },
];

/** Local-part prefix of the daily QA bot accounts, e.g. `qa+20261119@host`. */
export const QA_EMAIL_PREFIX = "qa+";

/**
 * True for a QA bot account: the local part (start of the address) begins with
 * `qa+`, case-insensitive. `aqa+x@...` and `qa@...` are real people.
 */
export function isQaTestEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase().startsWith(QA_EMAIL_PREFIX);
}

/**
 * Prisma `where` for `User` that leaves QA bot accounts out. Accounts without
 * an address stay in (a bare NOT would drop NULL rows). Read-side only: the
 * rows are never touched. Spread it into a user filter, or nest it under
 * `user:` on a relation.
 */
export const NOT_QA_USER: Prisma.UserWhereInput = {
  OR: [
    { email: null },
    { NOT: { email: { startsWith: QA_EMAIL_PREFIX, mode: "insensitive" } } },
  ],
};

export type InternalCheckInput = {
  email: string | null;
  role: string | null;
  sandboxKind: SandboxKind | string | null;
  internal: boolean;
};

/** Exact owner addresses from `INTERNAL_ACCOUNT_EMAILS`, lower-cased. */
export function parseInternalEmails(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

export function internalEmailsFromEnv(): string[] {
  return parseInternalEmails(process.env.INTERNAL_ACCOUNT_EMAILS);
}

export function emailMatchesRule(email: string, rule: EmailRule): boolean {
  const value = email.toLowerCase();
  const needle = rule.value.toLowerCase();
  if (rule.op === "endsWith") return value.endsWith(needle);
  if (rule.op === "startsWith") return value.startsWith(needle);
  return value.includes(needle);
}

/** The reason an account is internal, or null for an external person. */
export function internalReason(
  user: InternalCheckInput,
  ownerEmails: readonly string[] = []
): string | null {
  if (user.internal) return "flag";
  if (user.role === "admin") return "admin";
  if (user.sandboxKind) return "sandbox";
  if (user.email) {
    const email = user.email.toLowerCase();
    if (isQaTestEmail(email)) return "qa-account";
    if (ownerEmails.includes(email)) return "owner-email";
    if (INTERNAL_EMAIL_RULES.some((rule) => emailMatchesRule(email, rule))) {
      return "email-pattern";
    }
  }
  return null;
}

export function isInternalAccount(
  user: InternalCheckInput,
  ownerEmails: readonly string[] = []
): boolean {
  return internalReason(user, ownerEmails) !== null;
}
