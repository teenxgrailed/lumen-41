import type {
  MailAccount,
  MailMessage,
  Prisma,
  SystemSettings,
  TaskProvider,
} from "@prisma/client";

/**
 * Response shapes for rows that sit next to provider credentials.
 *
 * Every field is picked by name, so a column added to one of these tables later
 * stays server-side until someone chooses to publish it. Use these at the
 * boundary of any route that returns a mail account, a mail message with its
 * account, a task provider or the system settings.
 */

/** Shown in place of a stored secret so a form can tell "set" from "empty". */
export const SECRET_MASK = "••••••••";
const MASK_CHAR = "•";

// ---------------------------------------------------------------------------
// Mail
// ---------------------------------------------------------------------------

export const publicMailAccountSelect = {
  id: true,
  provider: true,
  address: true,
  status: true,
  lastSyncAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.MailAccountSelect;

type MailAccountSummarySource = Pick<
  MailAccount,
  "id" | "provider" | "address" | "status"
>;

export function toPublicMailAccountSummary(account: MailAccountSummarySource) {
  return {
    id: account.id,
    provider: account.provider,
    address: account.address,
    status: account.status,
  };
}

/** A mailbox without its IMAP credentials, OAuth connection or sync cursor. */
export function toPublicMailAccount<
  T extends Pick<
    MailAccount,
    | "id"
    | "provider"
    | "address"
    | "status"
    | "lastSyncAt"
    | "createdAt"
    | "updatedAt"
  > & { _count?: { messages: number } },
>(account: T) {
  return {
    ...toPublicMailAccountSummary(account),
    lastSyncAt: account.lastSyncAt,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    ...(account._count && { _count: { messages: account._count.messages } }),
  };
}

/** A message whose `account` carries only what the reader displays. */
export function toPublicMailMessage(
  message: MailMessage & { account: MailAccountSummarySource }
) {
  return {
    id: message.id,
    accountId: message.accountId,
    externalId: message.externalId,
    threadId: message.threadId,
    fromName: message.fromName,
    fromAddress: message.fromAddress,
    toAddresses: message.toAddresses,
    subject: message.subject,
    snippet: message.snippet,
    bodyHtml: message.bodyHtml,
    date: message.date,
    isRead: message.isRead,
    isArchived: message.isArchived,
    snoozedUntil: message.snoozedUntil,
    labels: message.labels,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    account: toPublicMailAccountSummary(message.account),
  };
}

// ---------------------------------------------------------------------------
// Task providers
// ---------------------------------------------------------------------------

export const publicTaskProviderSelect = {
  id: true,
  userId: true,
  type: true,
  name: true,
  enabled: true,
  syncEnabled: true,
  syncInterval: true,
  lastSyncedAt: true,
  accountId: true,
  defaultProjectId: true,
  settings: true,
  error: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.TaskProviderSelect;

export type PublicTaskProvider = Pick<
  TaskProvider,
  keyof typeof publicTaskProviderSelect
>;

/** A task provider without its access or refresh token. */
export function toPublicTaskProvider(
  provider: PublicTaskProvider
): PublicTaskProvider {
  return {
    id: provider.id,
    userId: provider.userId,
    type: provider.type,
    name: provider.name,
    enabled: provider.enabled,
    syncEnabled: provider.syncEnabled,
    syncInterval: provider.syncInterval,
    lastSyncedAt: provider.lastSyncedAt,
    accountId: provider.accountId,
    defaultProjectId: provider.defaultProjectId,
    settings: provider.settings,
    error: provider.error,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// System settings
// ---------------------------------------------------------------------------

const SYSTEM_SETTINGS_SECRET_KEYS = [
  "googleClientSecret",
  "outlookClientSecret",
  "resendApiKey",
] as const satisfies ReadonlyArray<keyof SystemSettings>;

function maskSecret(value: string | null): string | null {
  return value ? SECRET_MASK : null;
}

/**
 * System settings with every stored secret replaced by {@link SECRET_MASK}.
 * Admins can still see whether a secret is configured and overwrite it.
 */
export function toPublicSystemSettings(settings: SystemSettings) {
  return {
    id: settings.id,
    googleClientId: settings.googleClientId,
    googleClientSecret: maskSecret(settings.googleClientSecret),
    outlookClientId: settings.outlookClientId,
    outlookClientSecret: maskSecret(settings.outlookClientSecret),
    outlookTenantId: settings.outlookTenantId,
    logLevel: settings.logLevel,
    logRetention: settings.logRetention,
    logDestination: settings.logDestination,
    publicSignup: settings.publicSignup,
    requireEmailVerificationBeforeAccess:
      settings.requireEmailVerificationBeforeAccess,
    disableHomepage: settings.disableHomepage,
    resendApiKey: maskSecret(settings.resendApiKey),
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}

/**
 * Drop secret fields that still carry the mask (or an edit of it), so a form
 * that echoes back what it loaded never overwrites a stored secret.
 */
export function withoutMaskedSecrets<T extends Record<string, unknown>>(
  updates: T
): T {
  const result: Record<string, unknown> = { ...updates };
  for (const key of SYSTEM_SETTINGS_SECRET_KEYS) {
    const value = result[key];
    if (typeof value === "string" && value.includes(MASK_CHAR)) {
      delete result[key];
    }
  }
  return result as T;
}
