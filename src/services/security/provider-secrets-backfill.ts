import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
} from "@/lib/security/secret-encryption";

const LOG_SOURCE = "ProviderSecretsBackfill";
const DEFAULT_BATCH_SIZE = 200;

/**
 * Re-writes stored provider credentials so they are all encrypted (or, for a
 * rollback to a release that cannot read ciphertext, all plaintext again).
 *
 * Covered columns:
 * - ConnectedAccount.accessToken / refreshToken - Google and Outlook OAuth
 *   tokens for calendar, mail and tasks, and CalDAV passwords.
 * - TaskProvider.accessToken / refreshToken - unused by current code, covered
 *   so no plaintext copy survives.
 * - Account.access_token / refresh_token - NextAuth sign-in tokens.
 *
 * Idempotent: rows already in the target form are skipped. Each row is
 * updated only if its columns still hold the values that were read, so a
 * token refresh that lands mid-run is never overwritten with a stale value.
 * Values are never logged.
 */

export type ProviderSecretsDirection = "encrypt" | "decrypt";

export interface ProviderSecretsTableResult {
  scanned: number;
  updated: number;
  skipped: number;
  failed: number;
}

export interface ProviderSecretsBackfillResult {
  direction: ProviderSecretsDirection;
  connectedAccount: ProviderSecretsTableResult;
  taskProvider: ProviderSecretsTableResult;
  account: ProviderSecretsTableResult;
}

type SecretRow = { id: string } & Record<string, string | null>;

interface SecretTable {
  name: string;
  columns: string[];
  fetch(afterId: string | null, take: number): Promise<SecretRow[]>;
  /** Writes `next` when the row still holds `expected`; returns rows changed. */
  update(
    id: string,
    expected: Record<string, string | null>,
    next: Record<string, string | null>
  ): Promise<number>;
}

function page(afterId: string | null, take: number) {
  return {
    take,
    orderBy: { id: "asc" as const },
    ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
  };
}

const TABLES: SecretTable[] = [
  {
    name: "connectedAccount",
    columns: ["accessToken", "refreshToken"],
    fetch: (afterId, take) =>
      prisma.connectedAccount.findMany({
        ...page(afterId, take),
        select: { id: true, accessToken: true, refreshToken: true },
      }),
    update: async (id, expected, next) =>
      (
        await prisma.connectedAccount.updateMany({
          where: {
            id,
            accessToken: expected.accessToken as string,
            refreshToken: expected.refreshToken,
          },
          data: {
            accessToken: next.accessToken as string,
            refreshToken: next.refreshToken,
          },
        })
      ).count,
  },
  {
    name: "taskProvider",
    columns: ["accessToken", "refreshToken"],
    fetch: (afterId, take) =>
      prisma.taskProvider.findMany({
        ...page(afterId, take),
        select: { id: true, accessToken: true, refreshToken: true },
      }),
    update: async (id, expected, next) =>
      (
        await prisma.taskProvider.updateMany({
          where: {
            id,
            accessToken: expected.accessToken,
            refreshToken: expected.refreshToken,
          },
          data: {
            accessToken: next.accessToken,
            refreshToken: next.refreshToken,
          },
        })
      ).count,
  },
  {
    name: "account",
    columns: ["access_token", "refresh_token"],
    fetch: (afterId, take) =>
      prisma.account.findMany({
        ...page(afterId, take),
        select: { id: true, access_token: true, refresh_token: true },
      }),
    update: async (id, expected, next) =>
      (
        await prisma.account.updateMany({
          where: {
            id,
            access_token: expected.access_token,
            refresh_token: expected.refresh_token,
          },
          data: {
            access_token: next.access_token,
            refresh_token: next.refresh_token,
          },
        })
      ).count,
  },
];

function transform(
  value: string | null,
  direction: ProviderSecretsDirection
): string | null {
  if (value === null) return null;
  return direction === "encrypt" ? encryptSecret(value) : decryptSecret(value);
}

function needsChange(
  value: string | null,
  direction: ProviderSecretsDirection
): boolean {
  if (value === null || value === "") return false;
  return direction === "encrypt"
    ? !isEncryptedSecret(value)
    : isEncryptedSecret(value);
}

async function processTable(
  table: SecretTable,
  direction: ProviderSecretsDirection,
  batchSize: number
): Promise<ProviderSecretsTableResult> {
  const result: ProviderSecretsTableResult = {
    scanned: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };
  let afterId: string | null = null;

  for (;;) {
    const rows = await table.fetch(afterId, batchSize);
    if (rows.length === 0) break;

    for (const row of rows) {
      result.scanned += 1;
      const expected = Object.fromEntries(
        table.columns.map((column) => [column, row[column] ?? null])
      );
      if (
        !table.columns.some((column) =>
          needsChange(expected[column], direction)
        )
      ) {
        result.skipped += 1;
        continue;
      }

      try {
        const next = Object.fromEntries(
          table.columns.map((column) => [
            column,
            needsChange(expected[column], direction)
              ? transform(expected[column], direction)
              : expected[column],
          ])
        );
        const changed = await table.update(row.id, expected, next);
        if (changed > 0) result.updated += 1;
        else result.skipped += 1;
      } catch (error) {
        result.failed += 1;
        await logger.error(
          "Failed to re-write stored provider secret",
          {
            table: table.name,
            id: row.id,
            direction,
            // The message never contains the value; see decryptSecret.
            error: error instanceof Error ? error.message : "Unknown error",
          },
          LOG_SOURCE
        );
      }
    }

    afterId = rows[rows.length - 1].id;
    if (rows.length < batchSize) break;
  }

  return result;
}

export async function backfillProviderSecrets(
  options: {
    direction?: ProviderSecretsDirection;
    batchSize?: number;
  } = {}
): Promise<ProviderSecretsBackfillResult> {
  const direction = options.direction ?? "encrypt";
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  const [connectedAccount, taskProvider, account] = [
    await processTable(TABLES[0], direction, batchSize),
    await processTable(TABLES[1], direction, batchSize),
    await processTable(TABLES[2], direction, batchSize),
  ];
  const result = { direction, connectedAccount, taskProvider, account };

  const counts: Record<string, number> = {};
  for (const [table, tableResult] of Object.entries({
    connectedAccount,
    taskProvider,
    account,
  })) {
    for (const [key, value] of Object.entries(tableResult)) {
      counts[`${table}.${key}`] = value;
    }
  }
  await logger.info(
    "Provider secrets backfill finished",
    { direction, ...counts },
    LOG_SOURCE
  );
  return result;
}
