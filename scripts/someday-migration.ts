/**
 * The Someday launch migration (openspec finish-today-daily-planner, PR E).
 *
 * Moves every open task nobody touched for 14 days to Someday, using exactly
 * the selection of the nightly sweep (`scanSomedayCandidates`), so the two can
 * never disagree about what is stale or protected.
 *
 *   node scripts/someday-migration.cjs --dry-run
 *       The default. Reads only and prints numbers: tasks and users that would
 *       move, the per-user distribution, and how many tasks each protection
 *       rule kept out. The database enforces it: every query runs in a
 *       transaction that starts with SET TRANSACTION READ ONLY, so a write
 *       fails with an error. Prints no title, email or id.
 *   node scripts/someday-migration.cjs --apply --backup-id <id> [--batch-size 200]
 *       Moves the tasks (reason "migration"), writes one SomedayMigrationMove
 *       row per task so a user can "Return all", and records task_to_someday
 *       events. Idempotent: a second run moves 0. Refuses to start without a
 *       non-empty --backup-id (the id of the database copy taken the same day).
 *       NEEDS THE OWNER'S YES. Do not run it without one.
 *
 * Bundled to dist/scripts/someday-migration.cjs by `npm run build:scripts` and
 * shipped in the production image as scripts/someday-migration.cjs, so it runs
 * with plain `node` in the container (Coolify one-off command). Needs only
 * DATABASE_URL.
 */
import {
  DAY_PLAN_LIMITS,
  type SomedayExclusion,
} from "@/services/day-plan/rules";
import {
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
import { prisma } from "@/lib/prisma";

type Client = Pick<typeof prisma, "$transaction">;

const DEFAULT_BATCH_SIZE = 200;
const TX_TIMEOUT_MS = 60 * 60 * 1000;

export interface Args {
  mode: "dry-run" | "apply";
  backupId: string | null;
  batchSize: number;
  help: boolean;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    mode: "dry-run",
    backupId: null,
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

const EXCLUSIONS: SomedayExclusion[] = [
  "not_open",
  "archived",
  "trashed",
  "already_someday",
  "recurring",
  "habit",
  "sample",
  "open_plan",
  "near_deadline",
];

export interface DryRunReport {
  mode: "dry-run";
  asOf: string;
  staleDays: number;
  wouldMove: number;
  users: number;
  distribution: Record<Bucket, number>;
  largestPerUser: number;
  excluded: Record<string, number>;
}

/**
 * Read-only by construction: one transaction, opened with SET TRANSACTION READ
 * ONLY before the first query, so Postgres itself refuses any write.
 */
export async function runDryRun(
  client: Client,
  now: Date
): Promise<DryRunReport> {
  const perUser = new Map<string, number>();
  const counted: Partial<Record<SomedayExclusion, number>> = {};
  await client.$transaction(
    async (tx: Prisma.TransactionClient) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await scanSomedayCandidates(tx as unknown as SomedayReader, now, {
        excluded: counted,
        onUser: async (userId, ids) => {
          perUser.set(userId, (perUser.get(userId) ?? 0) + ids.length);
        },
      });
    },
    { timeout: TX_TIMEOUT_MS, maxWait: 60_000 }
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
}

export async function runApply(
  client: Client,
  now: Date,
  options: { backupId: string; batchSize: number }
): Promise<ApplyReport> {
  const backupId = options.backupId.trim();
  if (!backupId) {
    throw new Error("--apply needs --backup-id <id> of today's database copy");
  }
  const batch = `migration-${now.toISOString()}`;
  const perUser = new Map<string, number>();
  await scanSomedayCandidates(client as unknown as SomedayReader, now, {
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
                  movedAt: now,
                })),
                skipDuplicates: true,
              });
            }
            return rows.map((row) => row.id);
          },
          { timeout: 60_000, maxWait: 60_000 }
        );
        for (let n = 0; n < movedIds.length; n += 1) {
          recordActivation("task_to_someday", userId, { reason: "migration" });
        }
        if (movedIds.length > 0) {
          perUser.set(userId, (perUser.get(userId) ?? 0) + movedIds.length);
        }
      }
    },
  });
  await settleActivationEvents();
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
  };
}

const HELP = `Usage:
  node scripts/someday-migration.cjs [--dry-run]
  node scripts/someday-migration.cjs --apply --backup-id <id> [--batch-size ${DEFAULT_BATCH_SIZE}]

--dry-run is the default: read-only, prints counts only.
--apply moves the tasks. It needs --backup-id and the owner's yes.`;

export async function main(argv: string[]): Promise<number> {
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
    const now = newDate();
    if (args.mode === "apply") {
      if (!args.backupId || !args.backupId.trim()) {
        console.error(
          "Refusing to --apply without --backup-id <id> (the database copy taken today)."
        );
        return 2;
      }
      console.log(`backup-id: ${args.backupId.trim()}`);
      const report = await runApply(prisma, now, {
        backupId: args.backupId,
        batchSize: args.batchSize,
      });
      console.log(JSON.stringify(report));
      console.log(
        `APPLIED: moved ${report.moved} tasks for ${report.users} users (batch ${report.batch}, backup ${report.backupId})`
      );
      return 0;
    }
    const report = await runDryRun(prisma, now);
    console.log(JSON.stringify(report));
    console.log(
      `DRY RUN: ${report.wouldMove} tasks for ${report.users} users would move to Someday (largest single user: ${report.largestPerUser}). Nothing was written.`
    );
    return 0;
  } catch (error) {
    console.error(
      "someday-migration failed:",
      error instanceof Error ? error.message : String(error)
    );
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
