import fs from "fs";
import path from "path";

import { QUEUE_NAMES } from "@/lib/queue/types";

/* The admin scripts are plain CommonJS so they run with `node` inside the
   production image; jest loads them the same way. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const wipe = require("../../../scripts/admin/wipe-database.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const setFlag = require("../../../scripts/admin/set-flag.cjs");

const SCHEMA_TABLES: string[] = wipe.schemaTables(
  fs.readFileSync(path.join(__dirname, "../../../prisma/schema.prisma"), "utf8")
);
const LIVE_TABLES = [...SCHEMA_TABLES, "_prisma_migrations"].sort();
const PHRASE: string = wipe.CONFIRM_PHRASE;
const KEEP: string[] = wipe.KEEP_TABLES;

type ForeignKey = { name: string; fromTable: string; toTable: string };

function fakeDb(foreignKeys: ForeignKey[] = [], tables = LIVE_TABLES) {
  const queries: string[] = [];
  const truncates: string[] = [];
  const db = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes("FROM pg_tables")) {
        return tables.map((tablename) => ({ tablename }));
      }
      if (sql.includes("FROM pg_constraint")) return foreignKeys;
      if (sql.includes("count(*)")) {
        return [...sql.matchAll(/SELECT '([^']+)' AS t/g)].map((m) => ({
          t: m[1],
          n: BigInt(3),
        }));
      }
      throw new Error(`unexpected query: ${sql}`);
    }),
    truncate: jest.fn(async (sql: string) => {
      truncates.push(sql);
    }),
  };
  return { db, queries, truncates };
}

function fakeQueues() {
  const calls: Array<[string, string, unknown?]> = [];
  const makeQueue = (name: string) => ({
    getJobCounts: async () => ({ waiting: 2, delayed: 1, active: 0 }),
    getJobSchedulers: async () => [{ key: `${name}-scheduler` }],
    getRepeatableJobs: async () => [
      { key: `${name}-scheduler` },
      { key: `${name}-legacy` },
    ],
    removeJobScheduler: async (key: string) => {
      calls.push([name, "removeJobScheduler", key]);
    },
    removeRepeatableByKey: async (key: string) => {
      calls.push([name, "removeRepeatableByKey", key]);
    },
    drain: async (delayed: boolean) => {
      calls.push([name, "drain", delayed]);
    },
    close: async () => {
      calls.push([name, "close"]);
    },
  });
  return { makeQueue, calls };
}

const quiet = { log: () => {}, error: () => {}, schema: null };
const PROD = {
  NODE_ENV: "production",
  WIPE_CONFIRM: PHRASE,
  DATABASE_URL: "postgresql://u:secret@db:5432/needt",
  REDIS_URL: "redis://redis:6379",
};
const REAL = wipe.parseArgs(["--confirm"]);
const DRY = wipe.parseArgs([]);

describe("keep list", () => {
  it("keeps the waitlist, global flags, system settings and migrations", () => {
    for (const table of [
      "Waitlist",
      "PendingWaitlist",
      "AppWaitlist",
      "FeatureFlag",
      "SystemSettings",
      "BetaSettings",
      "_prisma_migrations",
    ]) {
      expect(wipe.isKept(table)).toBe(true);
    }
    // Any future waitlist or referral table is kept without an edit.
    expect(wipe.isKept("WaitlistReferral")).toBe(true);
    expect(wipe.isKept("referral_codes")).toBe(true);
    // Per-user data is not.
    for (const table of ["User", "FeatureFlagOverride", "Task", "Account"]) {
      expect(wipe.isKept(table)).toBe(false);
    }
  });

  it("every kept model exists in prisma/schema.prisma", () => {
    for (const table of KEEP.filter((t) => t !== "_prisma_migrations")) {
      expect(SCHEMA_TABLES).toContain(table);
    }
    // @@map names are used, not model names.
    expect(SCHEMA_TABLES).toContain("LifetimeCheckoutReservation");
  });

  it("never puts a kept table in the TRUNCATE statement", () => {
    const { keep, truncate } = wipe.partition(LIVE_TABLES);
    expect(keep.sort()).toEqual([...KEEP].sort());
    const sql: string = wipe.buildTruncateSql(truncate);
    expect(sql).toMatch(/^TRUNCATE TABLE ".+" RESTART IDENTITY CASCADE$/);
    for (const table of KEEP) expect(sql).not.toContain(`"${table}"`);
    expect(sql).toContain('"User"');
    expect(sql).toContain('"FeatureFlagOverride"');
    expect(() => wipe.buildTruncateSql(["User", "Waitlist"])).toThrow(
      /kept tables: Waitlist/
    );
  });

  it("matches the queue names of the app", () => {
    expect([...wipe.QUEUE_NAMES].sort()).toEqual(
      Object.values(QUEUE_NAMES).sort()
    );
  });
});

describe("wipe run", () => {
  it("dry run (the default) writes nothing", async () => {
    const { db, queries, truncates } = fakeDb();
    const { makeQueue, calls } = fakeQueues();
    const code = await wipe.run(db, wipe.parseArgs(["--flush-queues"]), PROD, {
      ...quiet,
      makeQueue,
    });
    expect(code).toBe(0);
    expect(truncates).toEqual([]);
    expect(
      queries.some((q) => /^\s*(TRUNCATE|DELETE|UPDATE|INSERT)\b/i.test(q))
    ).toBe(false);
    expect(calls.filter(([, method]) => method !== "close")).toEqual([]);
  });

  it("refuses --confirm without the exact WIPE_CONFIRM phrase", async () => {
    for (const value of [
      undefined,
      "",
      "yes",
      `${PHRASE} `,
      PHRASE.toUpperCase(),
    ]) {
      const { db, truncates } = fakeDb();
      const code = await wipe.run(
        db,
        REAL,
        { ...PROD, WIPE_CONFIRM: value },
        quiet
      );
      expect(code).toBe(2);
      expect(truncates).toEqual([]);
      expect(db.query).not.toHaveBeenCalled();
    }
  });

  it("treats the phrase without --confirm as a dry run", async () => {
    const { db, truncates } = fakeDb();
    expect(await wipe.run(db, DRY, PROD, quiet)).toBe(0);
    expect(truncates).toEqual([]);
  });

  it("refuses outside production unless --allow-non-production", async () => {
    const env = { ...PROD, NODE_ENV: "development" };
    const refused = fakeDb();
    expect(await wipe.run(refused.db, REAL, env, quiet)).toBe(2);
    expect(refused.truncates).toEqual([]);

    const allowed = fakeDb();
    const args = wipe.parseArgs(["--confirm", "--allow-non-production"]);
    expect(await wipe.run(allowed.db, args, env, quiet)).toBe(0);
    expect(allowed.truncates).toHaveLength(1);
  });

  it("with both confirmations runs exactly one TRUNCATE without kept tables", async () => {
    const { db, truncates } = fakeDb();
    expect(await wipe.run(db, REAL, PROD, quiet)).toBe(0);
    expect(truncates).toHaveLength(1);
    for (const table of KEEP) expect(truncates[0]).not.toContain(`"${table}"`);
    expect(truncates[0]).toContain('"Task"');
  });

  it("aborts when a kept table has a foreign key into a truncated table", async () => {
    const { db, truncates } = fakeDb([
      { name: "Task_userId_fkey", fromTable: "Task", toTable: "User" },
      { name: "Waitlist_userId_fkey", fromTable: "Waitlist", toTable: "User" },
    ]);
    const errors: string[] = [];
    const code = await wipe.run(db, REAL, PROD, {
      ...quiet,
      error: (m: string) => errors.push(m),
    });
    expect(code).toBe(3);
    expect(truncates).toEqual([]);
    expect(errors.join("\n")).toContain("Waitlist_userId_fkey");
  });

  it("ignores foreign keys between kept tables and from emptied tables", () => {
    const { keep, truncate } = wipe.partition(LIVE_TABLES);
    expect(
      wipe.cascadeHazards(
        [
          {
            name: "a",
            fromTable: "FeatureFlagOverride",
            toTable: "FeatureFlag",
          },
          { name: "b", fromTable: "Waitlist", toTable: "PendingWaitlist" },
        ],
        keep,
        truncate
      )
    ).toEqual([]);
  });

  it("--flush-queues removes schedulers, legacy repeatables and waiting/delayed jobs", async () => {
    const { db } = fakeDb();
    const { makeQueue, calls } = fakeQueues();
    const args = wipe.parseArgs(["--confirm", "--flush-queues"]);
    expect(await wipe.run(db, args, PROD, { ...quiet, makeQueue })).toBe(0);
    for (const name of wipe.QUEUE_NAMES) {
      expect(calls).toContainEqual([
        name,
        "removeJobScheduler",
        `${name}-scheduler`,
      ]);
      expect(calls).toContainEqual([
        name,
        "removeRepeatableByKey",
        `${name}-legacy`,
      ]);
      expect(calls).not.toContainEqual([
        name,
        "removeRepeatableByKey",
        `${name}-scheduler`,
      ]);
      expect(calls).toContainEqual([name, "drain", true]);
      expect(calls).toContainEqual([name, "close"]);
    }
  });
});

describe("set-flag", () => {
  function flagClient(row: unknown) {
    return {
      featureFlag: {
        findUnique: jest.fn(async () => row),
        upsert: jest.fn(async (args: { create: unknown }) => args.create),
      },
    };
  }

  it("dry run by default", async () => {
    const client = flagClient({
      key: "signups_open",
      enabled: false,
      rolloutPercentage: 0,
    });
    const args = setFlag.parseArgs([
      "--key",
      "signups_open",
      "--enabled",
      "true",
    ]);
    expect(await setFlag.run(client, args, () => {})).toBe(0);
    expect(client.featureFlag.upsert).not.toHaveBeenCalled();
  });

  it("enabling sets the rollout to 100 so the flag is on for everybody", async () => {
    const client = flagClient(null);
    const args = setFlag.parseArgs([
      "--key=signups_open",
      "--enabled=true",
      "--confirm",
    ]);
    expect(await setFlag.run(client, args, () => {})).toBe(0);
    expect(client.featureFlag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "signups_open" },
        create: { key: "signups_open", enabled: true, rolloutPercentage: 100 },
      })
    );
  });

  it("disabling keeps the rollout", () => {
    expect(
      setFlag.nextState(
        { enabled: true, rolloutPercentage: 100 },
        setFlag.parseArgs(["--key", "signups_open", "--enabled", "false"])
      )
    ).toEqual({ enabled: false, rolloutPercentage: 100 });
  });

  it("rejects bad input", () => {
    expect(() => setFlag.parseArgs(["--enabled", "yes"])).toThrow();
    expect(() => setFlag.parseArgs(["--key", "a b"])).toThrow();
    expect(() => setFlag.parseArgs(["--rollout", "150"])).toThrow();
  });
});
