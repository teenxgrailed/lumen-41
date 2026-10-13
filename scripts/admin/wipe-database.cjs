#!/usr/bin/env node
/**
 * Empty the WHOLE database except the waitlist and the operator configuration.
 * Built for the one-off pre-launch wipe of production.
 *
 *   node scripts/admin/wipe-database.cjs
 *       DRY RUN: lists the kept and the emptied tables with their row counts.
 *   WIPE_CONFIRM="delete everything except the waitlist" \
 *     node scripts/admin/wipe-database.cjs --confirm
 *       Empties every table that is not kept, in ONE statement:
 *       TRUNCATE TABLE "a","b",... RESTART IDENTITY CASCADE
 *       then prints the counts again.
 *
 * Flags:
 *   --confirm               required for the real run, together with the
 *                           WIPE_CONFIRM environment variable (exact phrase).
 *   --allow-non-production  the real run refuses unless NODE_ENV=production;
 *                           this lifts that for a local or staging database.
 *   --flush-queues          also remove the waiting, delayed and repeatable
 *                           jobs of the app's BullMQ queues (REDIS_URL). Only
 *                           the queues listed in QUEUE_NAMES are touched; no
 *                           other Redis key is. In a dry run it only counts.
 *
 * Kept tables: KEEP_TABLES below, plus any table whose name mentions
 * "waitlist" or "referral", so a future waitlist table is kept without an
 * edit here. Everything else that exists in the live schema
 * (pg_tables, current_schema()) is emptied, so tables added by later
 * migrations are covered automatically. prisma/schema.prisma is read only to
 * report drift between the schema and the database.
 *
 * CASCADE empties every table with a foreign key INTO an emptied table. If a
 * kept table had such a key, CASCADE would silently empty it too, so the run
 * aborts before writing anything when pg_constraint shows one.
 *
 * Plain CommonJS so it runs with `node` inside the production image (/app),
 * where @prisma/client, bullmq, DATABASE_URL and REDIS_URL exist.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const CONFIRM_PHRASE = "delete everything except the waitlist";

/**
 * Tables that are never emptied:
 *   Waitlist, PendingWaitlist   the launch waitlist and unverified sign-ups
 *   FeatureFlag                 global flags (design_v3, signups_open, ...);
 *                               per-user FeatureFlagOverride rows ARE emptied
 *   SystemSettings              admin-saved OAuth client ids/secrets, Resend key
 *   BetaSettings                waitlist/invitation configuration
 *   _prisma_migrations          migration history
 */
const KEEP_TABLES = Object.freeze([
  "Waitlist",
  "PendingWaitlist",
  "FeatureFlag",
  "SystemSettings",
  "BetaSettings",
  "_prisma_migrations",
]);
const KEEP_PATTERN = /waitlist|referral/i;

/** Mirrors QUEUE_NAMES in src/lib/queue/types.ts (a test keeps them equal). */
const QUEUE_NAMES = Object.freeze([
  "calendar-sync",
  "reschedule",
  "webhook-renew",
  "mail-sync",
  "bug-report-sync",
  "reminders",
  "nudges",
  "oauth-cleanup",
  "lifetime-checkout-reconciliation",
  "trials",
  "account-lifecycle",
  "imports",
]);

function parseArgs(argv) {
  const args = {
    confirm: false,
    allowNonProduction: false,
    flushQueues: false,
    help: false,
  };
  for (const arg of argv) {
    if (arg === "--confirm") args.confirm = true;
    else if (arg === "--allow-non-production") args.allowNonProduction = true;
    else if (arg === "--flush-queues") args.flushQueues = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function isKept(table) {
  return KEEP_TABLES.includes(table) || KEEP_PATTERN.test(table);
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/** Table names declared by prisma/schema.prisma (model name or @@map). */
function schemaTables(schemaText) {
  const tables = [];
  const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let match;
  while ((match = modelRe.exec(schemaText)) !== null) {
    const map = /@@map\(\s*"([^"]+)"\s*\)/.exec(match[2]);
    tables.push(map ? map[1] : match[1]);
  }
  return tables;
}

function readSchemaTables() {
  const candidates = [
    path.join(process.cwd(), "prisma", "schema.prisma"),
    path.join(__dirname, "..", "..", "prisma", "schema.prisma"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return { file, tables: schemaTables(fs.readFileSync(file, "utf8")) };
    }
  }
  return null;
}

async function listTables(db) {
  const rows = await db.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename"
  );
  return rows.map((row) => row.tablename);
}

function partition(tables) {
  const keep = [];
  const truncate = [];
  for (const table of tables) (isKept(table) ? keep : truncate).push(table);
  return { keep, truncate };
}

async function listForeignKeys(db) {
  return db.query(
    `SELECT c.conname AS name, src.relname AS "fromTable", dst.relname AS "toTable"
       FROM pg_constraint c
       JOIN pg_class src ON src.oid = c.conrelid
       JOIN pg_class dst ON dst.oid = c.confrelid
       JOIN pg_namespace n ON n.oid = src.relnamespace
      WHERE c.contype = 'f' AND n.nspname = current_schema()`
  );
}

/** Foreign keys through which TRUNCATE ... CASCADE would reach a kept table. */
function cascadeHazards(foreignKeys, keep, truncate) {
  const kept = new Set(keep);
  const emptied = new Set(truncate);
  return foreignKeys.filter(
    (fk) => kept.has(fk.fromTable) && emptied.has(fk.toTable)
  );
}

async function countRows(db, tables) {
  if (tables.length === 0) return {};
  const sql = tables
    .map(
      (table) =>
        `SELECT '${table.replace(/'/g, "''")}' AS t, count(*)::bigint AS n FROM ${quoteIdent(table)}`
    )
    .join(" UNION ALL ");
  const rows = await db.query(sql);
  const counts = {};
  for (const row of rows) counts[row.t] = Number(row.n);
  return counts;
}

function buildTruncateSql(truncate) {
  if (truncate.length === 0) throw new Error("Nothing to truncate.");
  const kept = truncate.filter(isKept);
  if (kept.length > 0) {
    throw new Error(`Refusing to truncate kept tables: ${kept.join(", ")}`);
  }
  return `TRUNCATE TABLE ${truncate.map(quoteIdent).join(", ")} RESTART IDENTITY CASCADE`;
}

function printCounts(log, title, tables, counts) {
  log(`${title} (${tables.length}):`);
  const width = Math.max(10, ...tables.map((t) => t.length));
  let total = 0;
  for (const table of tables) {
    const n = counts[table] ?? 0;
    total += n;
    log(`  ${table.padEnd(width)}  ${n}`);
  }
  log(`  ${"TOTAL".padEnd(width)}  ${total}`);
}

function describeDatabase(url) {
  if (!url) return "(DATABASE_URL not set)";
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

const QUEUE_REMINDER =
  "Reminder: BullMQ jobs in Redis may still reference deleted rows; they fail harmlessly. " +
  "Use --flush-queues to remove waiting/delayed/repeatable jobs, then restart the worker " +
  "so it re-registers its repeatable jobs.";

/**
 * Removes job schedulers, legacy repeatables, and waiting/delayed jobs of the
 * app's queues. `makeQueue(name)` returns a BullMQ Queue (or a test double).
 */
async function flushQueues(makeQueue, names, { dryRun, log }) {
  const summary = [];
  for (const name of names) {
    const queue = makeQueue(name);
    try {
      const counts = await queue.getJobCounts(
        "waiting",
        "delayed",
        "prioritized",
        "paused",
        "active"
      );
      const schedulers = await queue.getJobSchedulers(0, -1);
      const repeatables = await queue.getRepeatableJobs(0, -1);
      // Schedulers created with upsertJobScheduler also show up in the
      // legacy repeatable list; remove each key once.
      const schedulerKeys = new Set(schedulers.map((s) => s.key));
      const legacy = repeatables.filter((r) => !schedulerKeys.has(r.key));
      const line = {
        queue: name,
        waiting: counts.waiting ?? 0,
        delayed: counts.delayed ?? 0,
        prioritized: counts.prioritized ?? 0,
        paused: counts.paused ?? 0,
        active: counts.active ?? 0,
        schedulers: schedulers.length + legacy.length,
      };
      if (!dryRun) {
        for (const s of schedulers) await queue.removeJobScheduler(s.key);
        for (const r of legacy) await queue.removeRepeatableByKey(r.key);
        await queue.drain(true);
      }
      summary.push(line);
      log(
        `  ${name.padEnd(34)} waiting=${line.waiting} delayed=${line.delayed} ` +
          `prioritized=${line.prioritized} paused=${line.paused} ` +
          `schedulers=${line.schedulers} active=${line.active} (active left alone)`
      );
    } finally {
      await queue.close();
    }
  }
  return summary;
}

/**
 * The whole run. `db` = { query(sql) -> rows, truncate(sql) }; `env` is the
 * process environment; `makeQueue` is only used with --flush-queues.
 * Returns the exit code.
 */
async function run(db, args, env, options = {}) {
  const log = options.log ?? console.log;
  const error = options.error ?? console.error;
  const schema =
    options.schema === undefined ? readSchemaTables() : options.schema;

  const realRun = args.confirm;
  if (realRun) {
    if (env.WIPE_CONFIRM !== CONFIRM_PHRASE) {
      error(
        `Refusing: --confirm also needs WIPE_CONFIRM="${CONFIRM_PHRASE}" (exact phrase). Nothing was changed.`
      );
      return 2;
    }
    if (env.NODE_ENV !== "production" && !args.allowNonProduction) {
      error(
        `Refusing: NODE_ENV is "${env.NODE_ENV ?? ""}", not "production". ` +
          "Pass --allow-non-production to wipe this database. Nothing was changed."
      );
      return 2;
    }
  } else if (env.WIPE_CONFIRM) {
    log("WIPE_CONFIRM is set but --confirm is not: this is still a DRY RUN.");
  }

  log(
    `Database: ${describeDatabase(env.DATABASE_URL)}  NODE_ENV=${env.NODE_ENV ?? ""}`
  );

  const tables = await listTables(db);
  const { keep, truncate } = partition(tables);

  if (schema) {
    const live = new Set(tables);
    const missing = schema.tables.filter((t) => !live.has(t));
    const extra = tables.filter(
      (t) => !schema.tables.includes(t) && !t.startsWith("_")
    );
    if (missing.length) {
      log(
        `Note: in ${schema.file} but not in the database (migrations pending?): ${missing.join(", ")}`
      );
    }
    if (extra.length) {
      log(
        `Note: in the database but not in the Prisma schema: ${extra.join(", ")}`
      );
    }
  }
  const absentKeep = KEEP_TABLES.filter((t) => !tables.includes(t));
  if (absentKeep.length) {
    log(
      `Note: kept tables not present in the database: ${absentKeep.join(", ")}`
    );
  }

  const hazards = cascadeHazards(await listForeignKeys(db), keep, truncate);
  if (hazards.length > 0) {
    error(
      "ABORT: CASCADE would also empty a kept table through these foreign keys:"
    );
    for (const fk of hazards) {
      error(`  ${fk.name}: "${fk.fromTable}" -> "${fk.toTable}"`);
    }
    error(
      "Nothing was changed. Drop or rework the key, or stop keeping that table."
    );
    return 3;
  }

  const sql = buildTruncateSql(truncate);
  const before = await countRows(db, tables);
  printCounts(log, "KEEP (never truncated)", keep, before);
  printCounts(
    log,
    realRun ? "TRUNCATE" : "TRUNCATE (would be emptied)",
    truncate,
    before
  );

  if (!realRun) {
    log("");
    log(sql);
    log("");
    log("DRY RUN. Nothing was changed.");
    log(
      `Real run: WIPE_CONFIRM="${CONFIRM_PHRASE}" node scripts/admin/wipe-database.cjs --confirm${args.flushQueues ? " --flush-queues" : ""}`
    );
  } else {
    log("");
    log("Truncating...");
    await db.truncate(sql);
    const after = await countRows(db, tables);
    printCounts(log, "KEEP after", keep, after);
    printCounts(log, "TRUNCATED after", truncate, after);
    const changed = keep.filter((t) => (after[t] ?? 0) !== (before[t] ?? 0));
    if (changed.length) {
      error(
        `WARNING: row counts of kept tables changed: ${changed.join(", ")}`
      );
    }
    log(
      "Done. There are no users now: open sign-up with set-flag.cjs to register again."
    );
  }

  log("");
  if (args.flushQueues) {
    if (!env.REDIS_URL) {
      error("--flush-queues needs REDIS_URL; queues were not touched.");
      return realRun ? 1 : 0;
    }
    if (!options.makeQueue)
      throw new Error("run() needs options.makeQueue for --flush-queues");
    log(
      realRun
        ? "Flushing BullMQ queues:"
        : "BullMQ queues (dry run, nothing removed):"
    );
    await flushQueues(options.makeQueue, QUEUE_NAMES, {
      dryRun: !realRun,
      log,
    });
    if (realRun)
      log(
        "Queues flushed. Restart the worker so it re-registers its repeatable jobs."
      );
  } else {
    log(QUEUE_REMINDER);
  }
  return 0;
}

function prismaDb(client) {
  return {
    query: (sql) => client.$queryRawUnsafe(sql),
    // One transaction so lock_timeout applies to the TRUNCATE: it needs an
    // exclusive lock on every table and must not queue behind app traffic
    // forever.
    truncate: (sql) =>
      client.$transaction([
        client.$executeRawUnsafe("SET LOCAL lock_timeout = '30s'"),
        client.$executeRawUnsafe(sql),
      ]),
  };
}

function bullQueueFactory(redisUrl) {
  const { Queue } = require("bullmq");
  return (name) =>
    new Queue(name, {
      connection: { url: redisUrl, maxRetriesPerRequest: null },
    });
}

const USAGE =
  "Usage: node scripts/admin/wipe-database.cjs [--flush-queues] [--confirm] [--allow-non-production]\n" +
  `  The real run needs --confirm AND WIPE_CONFIRM="${CONFIRM_PHRASE}".`;

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error(USAGE);
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const { PrismaClient } = require("@prisma/client");
  const client = new PrismaClient();
  try {
    return await run(prismaDb(client), args, process.env, {
      makeQueue:
        args.flushQueues && process.env.REDIS_URL
          ? bullQueueFactory(process.env.REDIS_URL)
          : undefined,
    });
  } catch (err) {
    console.error("FAILED:", err);
    return 1;
  } finally {
    await client.$disconnect();
  }
}

if (require.main === module) {
  main().then((code) => process.exit(code));
}

module.exports = {
  CONFIRM_PHRASE,
  KEEP_TABLES,
  QUEUE_NAMES,
  parseArgs,
  isKept,
  schemaTables,
  partition,
  cascadeHazards,
  buildTruncateSql,
  flushQueues,
  run,
};
