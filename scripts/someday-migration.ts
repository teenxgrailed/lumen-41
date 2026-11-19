/**
 * The Someday launch migration (openspec finish-today-daily-planner, PR E).
 *
 * Moves every open task nobody touched for 14 days to Someday, using the
 * selection of the nightly sweep (`scanSomedayCandidates`), so the two cannot
 * disagree about what is stale or protected. Beyond the sweep's rules it also
 * keeps out tasks the person pinned or froze, tasks scheduled in the future,
 * and people for whom `day_plan` (the kill switch) is off.
 *
 *   node scripts/someday-migration.cjs --dry-run
 *       The default. Reads only and prints numbers: tasks and users that would
 *       move, the per-user distribution, and how many tasks each protection
 *       rule kept out. The database enforces it: every query runs in a
 *       transaction that starts with SET TRANSACTION READ ONLY, so a write
 *       fails with an error. Prints no title, email or id. It scans every row
 *       (no page cap), so `wouldMove` is what --apply moves under the same
 *       flags. If a cap was hit anyway it prints `truncated: true` and exits 3.
 *   node scripts/someday-migration.cjs --apply --backup-id <id> [--backup-date YYYY-MM-DD] [--batch-size 200]
 *       Moves the tasks (reason "migration"), writes one SomedayMigrationMove
 *       row per task (carrying the backup id) so a user can "Return all", and
 *       records one task_to_someday event per person with a count. Idempotent:
 *       a second run moves 0. Refuses to start (exit 2) unless the backup is
 *       from today (UTC): the --backup-id must contain today's date as
 *       YYYYMMDD or YYYY-MM-DD, or --backup-date must equal today.
 *       NEEDS THE OWNER'S YES. Do not run it without one.
 *
 * Bundled to dist/scripts/someday-migration.cjs by `npm run build:scripts` and
 * shipped in the production image as scripts/someday-migration.cjs, so it runs
 * with plain `node` in the container (Coolify one-off command). Needs only
 * DATABASE_URL. The bundle swaps `@/lib/prisma` for its own client with
 * `log: []`, so Prisma never prints query or error text of its own.
 *
 * Nothing that identifies a person or a task goes to stdout or stderr; an error
 * prints only its name and code.
 */
import {
  DAY_PLAN_LIMITS,
  type SomedayExclusion,
} from "@/services/day-plan/rules";
import {
  type MigrationExclusion,
  type SomedayReader,
  moveTasksToSomeday,
  scanSomedayCandidates,
} from "@/services/day-plan/someday";
import type { Prisma } from "@prisma/client";

import {
  recordActivation,
  settleActivationEvents,
} from "@/lib/activation-events";
import { newDate } from "@/lib/date-utils";
import { dayPlanEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

type Client = Pick<typeof prisma, "$transaction">;
type DisconnectableClient = Client & { $disconnect: () => Promise<void> };

const DEFAULT_BATCH_SIZE = 200;
/** The dry run is one read-only transaction over every row: five minutes, not an hour. */
const DRY_RUN_TX_TIMEOUT_MS = 5 * 60 * 1000;
const APPLY_TX_TIMEOUT_MS = 60 * 1000;
/** Exit code when a page cap stopped the scan before the last row. */
const EXIT_TRUNCATED = 3;

export interface Args {
  mode: "dry-run" | "apply";
  backupId: string | null;
  backupDate: string | null;
  batchSize: number;
  help: boolean;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    mode: "dry-run",
    backupId: null,
    backupDate: null,
    batchSize: DEFAULT_BATCH_SIZE,
    help: false,
  };
  let dry = false;
  let apply = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") dry = true;
    else if (arg === "--apply") apply = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--backup-id") args.backupId = argv[(i += 1)] ?? "";
    else if (arg.startsWith("--backup-id=")) args.backupId = arg.slice(12);
    else if (arg === "--backup-date") args.backupDate = argv[(i += 1)] ?? "";
    else if (arg.startsWith("--backup-date=")) args.backupDate = arg.slice(14);
    else if (arg === "--batch-size" || arg.startsWith("--batch-size=")) {
      const raw = arg === "--batch-size" ? argv[(i += 1)] : arg.slice(13);
      const size = Number(raw);
      if (!Number.isInteger(size) || size < 1 || size > 5000) {
        throw new Error("--batch-size must be an integer from 1 to 5000");
      }
      args.batchSize = size;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (dry && apply) throw new Error("Use --dry-run or --apply, not both");
  if (apply) args.mode = "apply";
  return args;
}

/** `token` in `text` with no digit right before or after it (no regex, no input in a pattern). */
function hasDateToken(text: string, token: string): boolean {
  const isDigit = (char: string | undefined) =>
    char !== undefined && char >= "0" && char <= "9";
  for (
    let at = text.indexOf(token);
    at !== -1;
    at = text.indexOf(token, at + 1)
  ) {
    if (!isDigit(text[at - 1]) && !isDigit(text[at + token.length]))
      return true;
  }
  return false;
}

/**
 * The backup must be from today (UTC). Coolify's backup names may carry no date
 * at all, so `--backup-date YYYY-MM-DD` is the alternative proof. Throws a
 * message that names the rule, never the value.
 */
export function assertBackupFromToday(
  backupId: string,
  backupDate: string | null | undefined,
  now: Date
): void {
  if (!backupId.trim()) {
    throw new Error("--apply needs --backup-id <id> of today's database copy");
  }
  const dashed = now.toISOString().slice(0, 10);
  const compact = dashed.replace(/-/g, "");
  const inId =
    hasDateToken(backupId, compact) || hasDateToken(backupId, dashed);
  if (inId) return;
  if (backupDate && backupDate.trim() === dashed) return;
  throw new Error(
    "The backup must be from today (UTC): put today's date (YYYYMMDD or YYYY-MM-DD) in --backup-id, or pass --backup-date <today>"
  );
}

type Bucket = "1" | "2-5" | "6-20" | "21-100" | "100+";

function bucketOf(count: number): Bucket {
  if (count <= 1) return "1";
  if (count <= 5) return "2-5";
  if (count <= 20) return "6-20";
  if (count <= 100) return "21-100";
  return "100+";
}

/** Numbers only: how many people have how many tasks. No ids leave this function. */
function summarize(perUser: Map<string, number>) {
  const distribution: Record<Bucket, number> = {
    "1": 0,
    "2-5": 0,
    "6-20": 0,
    "21-100": 0,
    "100+": 0,
  };
  let total = 0;
  let largest = 0;
  for (const count of perUser.values()) {
    distribution[bucketOf(count)] += 1;
    total += count;
    if (count > largest) largest = count;
  }
  return {
    tasks: total,
    users: perUser.size,
    distribution,
    largestPerUser: largest,
  };
}

const EXCLUSIONS: (SomedayExclusion | MigrationExclusion)[] = [
  "not_open",
  "archived",
  "trashed",
  "already_someday",
  "recurring",
  "habit",
  "sample",
  "open_plan",
  "near_deadline",
  "pinned",
  "future_scheduled",
];

/** Scan limits. The migration reads every row by default; tests shrink the page. */
export interface ScanLimits {
  /** Pages to read before stopping and reporting `truncated`. Default: no cap. */
  maxPages?: number;
  /** Rows per page. Default: the scan's own (500). */
  pageSize?: number;
}

export interface DryRunReport {
  mode: "dry-run";
  asOf: string;
  staleDays: number;
  wouldMove: number;
  users: number;
  distribution: Record<Bucket, number>;
  largestPerUser: number;
  excluded: Record<string, number>;
  truncated: boolean;
}

/**
 * Read-only by construction: one transaction, opened with SET TRANSACTION READ
 * ONLY before the first query, so Postgres itself refuses any write. Bounded
 * too: a lock wait over 5 seconds or a statement over 120 seconds fails the
 * run instead of holding a connection.
 */
export async function runDryRun(
  client: Client,
  now: Date,
  limits: ScanLimits = {}
): Promise<DryRunReport> {
  const perUser = new Map<string, number>();
  const counted: Partial<
    Record<SomedayExclusion | MigrationExclusion, number>
  > = {};
  let truncated = false;
  await client.$transaction(
    async (tx: Prisma.TransactionClient) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '120s'");
      const result = await scanSomedayCandidates(
        tx as unknown as SomedayReader,
        now,
        {
          excluded: counted,
          keepPinnedAndScheduled: true,
          isAllowed: dayPlanEnabled,
          maxPages: limits.maxPages ?? Infinity,
          pageSize: limits.pageSize,
          onUser: async (userId, ids) => {
            perUser.set(userId, (perUser.get(userId) ?? 0) + ids.length);
          },
        }
      );
      truncated = result.truncated;
    },
    { timeout: DRY_RUN_TX_TIMEOUT_MS, maxWait: 60_000 }
  );
  const summary = summarize(perUser);
  const excluded: Record<string, number> = {};
  for (const reason of EXCLUSIONS) excluded[reason] = counted[reason] ?? 0;
  return {
    mode: "dry-run",
    asOf: now.toISOString(),
    staleDays: DAY_PLAN_LIMITS.staleDays,
    wouldMove: summary.tasks,
    users: summary.users,
    distribution: summary.distribution,
    largestPerUser: summary.largestPerUser,
    excluded,
    truncated,
  };
}

export interface ApplyReport {
  mode: "apply";
  asOf: string;
  backupId: string;
  batch: string;
  moved: number;
  users: number;
  distribution: Record<Bucket, number>;
  largestPerUser: number;
  truncated: boolean;
}

export async function runApply(
  client: Client,
  now: Date,
  options: {
    backupId: string;
    backupDate?: string | null;
    batchSize: number;
  } & ScanLimits
): Promise<ApplyReport> {
  const backupId = options.backupId.trim();
  assertBackupFromToday(backupId, options.backupDate, now);
  const batch = `migration-${now.toISOString()}`;
  const perUser = new Map<string, number>();
  let truncated = false;
  try {
    const result = await scanSomedayCandidates(
      client as unknown as SomedayReader,
      now,
      {
        keepPinnedAndScheduled: true,
        isAllowed: dayPlanEnabled,
        maxPages: options.maxPages ?? Infinity,
        pageSize: options.pageSize,
        onUser: async (userId, ids) => {
          for (let i = 0; i < ids.length; i += options.batchSize) {
            const chunk = ids.slice(i, i + options.batchSize);
            const movedIds = await client.$transaction(
              async (tx: Prisma.TransactionClient) => {
                await moveTasksToSomeday(userId, chunk, {
                  reason: "migration",
                  now,
                  tx: tx as unknown as Parameters<
                    typeof moveTasksToSomeday
                  >[2]["tx"],
                });
                // Record exactly what this run moved, not what it asked to move.
                const rows = await tx.task.findMany({
                  where: {
                    id: { in: chunk },
                    userId,
                    somedayAt: now,
                    somedayReason: "migration",
                  },
                  select: { id: true },
                });
                if (rows.length > 0) {
                  await tx.somedayMigrationMove.createMany({
                    data: rows.map((row) => ({
                      userId,
                      taskId: row.id,
                      batch,
                      backupId,
                      movedAt: now,
                    })),
                    skipDuplicates: true,
                  });
                }
                return rows.map((row) => row.id);
              },
              { timeout: APPLY_TX_TIMEOUT_MS, maxWait: 60_000 }
            );
            if (movedIds.length > 0) {
              perUser.set(userId, (perUser.get(userId) ?? 0) + movedIds.length);
            }
          }
        },
      }
    );
    truncated = result.truncated;
  } finally {
    // One event per person with the count, not one per task. Recorded even if
    // the run stopped half way, so the events match what was really moved.
    for (const [userId, count] of perUser) {
      recordActivation("task_to_someday", userId, {
        reason: "migration",
        count,
      });
    }
    await settleActivationEvents();
  }
  const summary = summarize(perUser);
  return {
    mode: "apply",
    asOf: now.toISOString(),
    backupId,
    batch,
    moved: summary.tasks,
    users: summary.users,
    distribution: summary.distribution,
    largestPerUser: summary.largestPerUser,
    truncated,
  };
}

const HELP = `Usage:
  node scripts/someday-migration.cjs [--dry-run]
  node scripts/someday-migration.cjs --apply --backup-id <id> [--backup-date YYYY-MM-DD] [--batch-size ${DEFAULT_BATCH_SIZE}]

--dry-run is the default: read-only, prints counts only.
--apply moves the tasks. It needs the owner's yes and a backup from today (UTC):
--backup-id must contain today's date (YYYYMMDD or YYYY-MM-DD), or pass
--backup-date <today>.`;

/** An error reduced to its name and code: a message can carry ids, titles or SQL. */
function describeError(error: unknown): string {
  const name =
    error instanceof Error && error.name ? error.name : "UnknownError";
  const code =
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : null;
  return code ? `${name} (${code})` : name;
}

export async function main(
  argv: string[],
  deps: { client?: DisconnectableClient; now?: Date } = {}
): Promise<number> {
  const client: DisconnectableClient =
    deps.client ?? (prisma as unknown as DisconnectableClient);
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(HELP);
    return 2;
  }
  if (args.help) {
    console.log(HELP);
    return 0;
  }
  try {
    const now = deps.now ?? newDate();
    if (args.mode === "apply") {
      if (!args.backupId || !args.backupId.trim()) {
        console.error(
          "Refusing to --apply without --backup-id <id> (the database copy taken today)."
        );
        return 2;
      }
      try {
        assertBackupFromToday(args.backupId, args.backupDate, now);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return 2;
      }
      console.log(`backup-id: ${args.backupId.trim()}`);
      const report = await runApply(client, now, {
        backupId: args.backupId,
        backupDate: args.backupDate,
        batchSize: args.batchSize,
      });
      console.log(JSON.stringify(report));
      console.log(
        `APPLIED: moved ${report.moved} tasks for ${report.users} users (batch ${report.batch}, backup ${report.backupId})`
      );
      if (report.truncated) {
        console.error(
          "truncated: true. A page cap stopped the scan before the last row; run again."
        );
        return EXIT_TRUNCATED;
      }
      return 0;
    }
    const report = await runDryRun(client, now);
    console.log(JSON.stringify(report));
    console.log(
      `DRY RUN: ${report.wouldMove} tasks for ${report.users} users would move to Someday (largest single user: ${report.largestPerUser}). Nothing was written.`
    );
    if (report.truncated) {
      console.error(
        "truncated: true. A page cap stopped the scan before the last row; the numbers are a lower bound."
      );
      return EXIT_TRUNCATED;
    }
    return 0;
  } catch (error) {
    console.error(`someday-migration failed: ${describeError(error)}`);
    return 1;
  } finally {
    try {
      await settleActivationEvents();
    } catch {
      // Events are best effort; the run's result is already decided.
    }
    await client.$disconnect().catch(() => undefined);
  }
}

if (require.main === module) {
  void main(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
