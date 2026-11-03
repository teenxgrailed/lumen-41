/**
 * Advisory reservations: exclusive conflicts name the holder and expiry,
 * shared ones coexist, renewal extends, expired and released ones are
 * ignored, file globs are overlap-checked, credentials are refused. An
 * in-memory stand-in for the table, so the expiry filter is really applied.
 */
import type { HubAgent, HubReservation } from "@prisma/client";

import { newDate } from "@/lib/date-utils";

import type { AgentScope } from "../context";
import {
  globsOverlap,
  listReservations,
  myReservations,
  normalizeResource,
  releaseReservation,
  reserve,
  resourcesOverlap,
} from "../reservations";

let rows: HubReservation[] = [];
let nextId = 1;

type Where = {
  userId?: string;
  workspaceId?: string;
  releasedAt?: null;
  expiresAt?: { gt: Date };
  agentId?: string | { not: string };
  resource?: string;
  id?: string;
};

function matches(row: HubReservation, where: Where) {
  if (where.userId && row.userId !== where.userId) return false;
  if (where.workspaceId && row.workspaceId !== where.workspaceId) return false;
  if (where.releasedAt === null && row.releasedAt !== null) return false;
  if (where.expiresAt && !(row.expiresAt > where.expiresAt.gt)) return false;
  if (typeof where.agentId === "string" && row.agentId !== where.agentId) {
    return false;
  }
  if (
    where.agentId &&
    typeof where.agentId === "object" &&
    row.agentId === where.agentId.not
  ) {
    return false;
  }
  if (where.resource && row.resource !== where.resource) return false;
  if (where.id && row.id !== where.id) return false;
  return true;
}

const db = {
  hubReservation: {
    findMany: jest.fn(async ({ where }: { where: Where }) =>
      rows.filter((row) => matches(row, where))
    ),
    findFirst: jest.fn(
      async ({ where }: { where: Where }) =>
        rows.find((row) => matches(row, where)) ?? null
    ),
    create: jest.fn(async ({ data }: { data: Partial<HubReservation> }) => {
      const row = {
        id: `r-${nextId++}`,
        releasedAt: null,
        createdAt: newDate(),
        ...data,
      } as HubReservation;
      rows.push(row);
      return row;
    }),
    update: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<HubReservation>;
      }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }
    ),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: Where;
        data: Partial<HubReservation>;
      }) => {
        const hit = rows.filter((row) => matches(row, where));
        hit.forEach((row) => Object.assign(row, data));
        return { count: hit.length };
      }
    ),
  },
  hubAgent: { findMany: jest.fn() },
};

jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return db;
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Built at run time so secret scanners do not flag the fixture.
const AWS_KEY = ["AK", "IA", "ABCDEFGHIJKLMNOP"].join("");

const USER = "user-1";
const WORKSPACE = "ws-1";

function agent(id: string, name: string): HubAgent {
  return {
    id,
    userId: USER,
    workspaceId: WORKSPACE,
    connectionKey: `token:${id}`,
    name,
    kind: "other",
    capabilities: "",
    skills: [],
    lastSeenAt: null,
    disabledAt: null,
    createdAt: newDate(),
    updatedAt: newDate(),
  };
}
const grok = agent("a-grok", "Grok Bot");
const codex = agent("a-codex", "Codex");
const scopeOf = (a: HubAgent): AgentScope => ({
  userId: USER,
  workspaceId: WORKSPACE,
  actor: { kind: "agent", agent: a },
});

beforeEach(() => {
  rows = [];
  nextId = 1;
  jest.clearAllMocks();
  db.hubAgent.findMany.mockResolvedValue([grok, codex]);
});

describe("reserve", () => {
  it("takes a free resource for 30 minutes by default", async () => {
    const before = Date.now();
    const { reservation, renewed } = await reserve(scopeOf(grok), {
      resource: "instagram:@Needt.app",
      reason: "posting the teaser",
    });
    expect(renewed).toBe(false);
    expect(reservation.resource).toBe("instagram:@needt.app");
    expect(reservation.exclusive).toBe(true);
    const ttl = new Date(reservation.expiresAt).getTime() - before;
    expect(ttl).toBeGreaterThan(29 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(30 * 60 * 1000 + 1000);
  });

  it("caps the time to 4 hours", async () => {
    const before = Date.now();
    const { reservation } = await reserve(scopeOf(grok), {
      resource: "account:hello@needt.app",
      reason: "long job",
      ttlMinutes: 9999,
    });
    const ttl = new Date(reservation.expiresAt).getTime() - before;
    expect(ttl).toBeLessThanOrEqual(240 * 60 * 1000 + 1000);
  });

  it("refuses an exclusive overlap with the holder and the expiry in the error", async () => {
    await reserve(scopeOf(grok), {
      resource: "instagram:@needt.app",
      reason: "posting",
    });
    const error = await reserve(scopeOf(codex), {
      resource: "instagram:@needt.app",
      reason: "also posting",
    }).catch((caught) => caught);
    expect(error).toMatchObject({ code: "CONFLICT", status: 409 });
    expect(error.body()).toMatchObject({
      holder: { id: grok.id, name: "Grok Bot" },
      resource: "instagram:@needt.app",
    });
    expect(error.body().expiresAt).toEqual(expect.any(String));
    expect(rows).toHaveLength(1);
  });

  it("lets shared reservations coexist but not with an exclusive one", async () => {
    await reserve(scopeOf(grok), {
      resource: "file:docs/**",
      reason: "reading",
      exclusive: false,
    });
    await expect(
      reserve(scopeOf(codex), {
        resource: "file:docs/**",
        reason: "also reading",
        exclusive: false,
      })
    ).resolves.toBeTruthy();
    await expect(
      reserve(scopeOf(codex), {
        resource: "file:docs/a.md",
        reason: "rewriting",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("renews what the same agent already holds instead of conflicting", async () => {
    const first = await reserve(scopeOf(grok), {
      resource: "account:hello@needt.app",
      reason: "sending",
      ttlMinutes: 5,
    });
    const again = await reserve(scopeOf(grok), {
      resource: "account:hello@needt.app",
      reason: "still sending",
      ttlMinutes: 60,
    });
    expect(again.renewed).toBe(true);
    expect(again.reservation.id).toBe(first.reservation.id);
    expect(rows).toHaveLength(1);
    expect(new Date(again.reservation.expiresAt).getTime()).toBeGreaterThan(
      new Date(first.reservation.expiresAt).getTime()
    );
  });

  it("ignores an expired reservation", async () => {
    await reserve(scopeOf(grok), {
      resource: "instagram:@needt.app",
      reason: "posting",
    });
    rows[0].expiresAt = newDate(Date.now() - 1000);
    await expect(
      reserve(scopeOf(codex), {
        resource: "instagram:@needt.app",
        reason: "my turn",
      })
    ).resolves.toBeTruthy();
    expect((await listReservations(scopeOf(codex))).reservations).toHaveLength(
      1
    );
  });

  it("frees the resource once its holder releases it", async () => {
    await reserve(scopeOf(grok), {
      resource: "instagram:@needt.app",
      reason: "posting",
    });
    expect(
      await releaseReservation(scopeOf(grok), {
        resource: "instagram:@needt.app",
      })
    ).toEqual({ released: 1 });
    await expect(
      reserve(scopeOf(codex), {
        resource: "instagram:@needt.app",
        reason: "my turn",
      })
    ).resolves.toBeTruthy();
    // A second release is a no-op, and nobody can release another agent's.
    expect(
      await releaseReservation(scopeOf(grok), {
        resource: "instagram:@needt.app",
      })
    ).toEqual({ released: 0 });
  });

  it("refuses credential-looking text and a malformed resource", async () => {
    await expect(
      reserve(scopeOf(grok), {
        resource: "account:hello@needt.app",
        reason: `login with ${AWS_KEY}`,
      })
    ).rejects.toMatchObject({ code: "INVALID" });
    await expect(
      reserve(scopeOf(grok), { resource: "no-kind", reason: "x" })
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(rows).toHaveLength(0);
  });
});

describe("what the inbox shows", () => {
  it("lists only the caller's own active reservations", async () => {
    await reserve(scopeOf(grok), { resource: "account:a@x.io", reason: "a" });
    await reserve(scopeOf(codex), { resource: "account:b@x.io", reason: "b" });
    const mine = await myReservations(scopeOf(grok));
    expect(mine.map((r) => r.resource)).toEqual(["account:a@x.io"]);
    expect(mine[0].mine).toBe(true);
  });
});

describe("overlap", () => {
  it("normalises names but keeps file paths exact", () => {
    expect(normalizeResource(" Account:Hello@Needt.app ")).toBe(
      "account:hello@needt.app"
    );
    expect(normalizeResource("file:src/App/**")).toBe("file:src/App/**");
  });

  it("treats non-file resources as equal or apart", () => {
    expect(resourcesOverlap("instagram:@a", "instagram:@a")).toBe(true);
    expect(resourcesOverlap("instagram:@a", "instagram:@b")).toBe(false);
    expect(resourcesOverlap("instagram:@a", "account:@a")).toBe(false);
  });

  it.each([
    ["src/app/**", "src/app/api/route.ts", true],
    ["src/app/**", "src/lib/date-utils.ts", false],
    ["src/**", "src/app/**", true],
    ["src/*.ts", "src/app/**", false],
    ["src/*.ts", "src/index.ts", true],
    ["src/**/*.test.ts", "src/services/a/b.test.ts", true],
    ["src/**/*.test.ts", "src/services/a/b.ts", false],
    ["docs/**", "docs", true], // a lock on a tree covers its root
    ["docs/**", "other", false],
    ["**", "anything/at/all.ts", true],
    ["src/a*.ts", "src/*b.ts", true],
    ["src/a.ts", "src/b.ts", false],
  ])("globs %s and %s overlap: %s", (a, b, expected) => {
    expect(globsOverlap(a, b)).toBe(expected);
    expect(globsOverlap(b, a)).toBe(expected);
  });

  it("applies the glob check to file reservations by two agents", async () => {
    await reserve(scopeOf(grok), {
      resource: "file:src/app/**",
      reason: "refactor",
    });
    await expect(
      reserve(scopeOf(codex), {
        resource: "file:src/app/api/route.ts",
        reason: "fix",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      reserve(scopeOf(codex), {
        resource: "file:src/lib/**",
        reason: "fix",
      })
    ).resolves.toBeTruthy();
  });
});
