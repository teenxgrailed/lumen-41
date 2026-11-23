/**
 * Idempotency keys on the hub create and complete paths: a retry with the same
 * key returns the first answer instead of a duplicate item or a second
 * completion. An in-memory stand-in plays the HubItem table; nothing here
 * touches a database, Redis or the realtime channel.
 */
import type { HubAgent, HubItem } from "@prisma/client";

import { newDate } from "@/lib/date-utils";

import type { AgentScope, HubScope } from "../context";
import { HubError } from "../errors";
import { completeItem, createItem } from "../items";
import { createItemWithRecurrence } from "../recurrences";
import { createItemInput, withCreateKey } from "../schemas";

const rows: HubItem[] = [];
const events: Array<Record<string, unknown>> = [];

type Where = Record<string, unknown>;

function matches(row: HubItem, where: Where): boolean {
  return Object.entries(where).every(([key, want]) => {
    const have = (row as unknown as Where)[key];
    if (want && typeof want === "object" && "in" in want) {
      return (want as { in: unknown[] }).in.includes(have);
    }
    return have === want;
  });
}

const hubItem = {
  findFirst: jest.fn(async ({ where }: { where: Where }) => {
    return rows.find((row) => matches(row, where)) ?? null;
  }),
  findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
    const row = rows.find((candidate) => candidate.id === where.id);
    if (!row) throw new Error("missing");
    return row;
  }),
  create: jest.fn(async ({ data }: { data: Partial<HubItem> }) => {
    const row = {
      id: `item-${rows.length + 1}`,
      version: 1,
      status: "open",
      claimedByAgentId: null,
      completionKey: null,
      recurrenceId: null,
      occurrenceAt: null,
      occurrenceExpiresAt: null,
      createdAt: newDate(),
      updatedAt: newDate(),
      closedAt: null,
      links: [],
      approvals: {},
      risks: [],
      criteriaItems: [],
      ...data,
    } as unknown as HubItem;
    rows.push(row);
    return row;
  }),
  updateMany: jest.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string; version: number };
      data: Record<string, unknown>;
    }) => {
      const row = rows.find(
        (candidate) =>
          candidate.id === where.id && candidate.version === where.version
      );
      if (!row) return { count: 0 };
      const { version, ...rest } = data;
      Object.assign(row, rest, { version: row.version + 1 });
      void version;
      return { count: 1 };
    }
  ),
};

const db: Record<string, unknown> = {
  hubItem,
  hubItemEvent: {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      events.push(data);
    }),
    findMany: jest.fn(async () => []),
  },
  hubItemLink: { findMany: jest.fn(async () => []) },
  hubAgent: { findMany: jest.fn(async () => []) },
  $transaction: jest.fn(async (work: (tx: unknown) => unknown) => work(db)),
};

jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return db;
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtime: jest.fn(),
  publishToUser: jest.fn(),
}));
jest.mock("../limits", () => ({
  assertHubLimit: jest.fn(),
  assertHubLimitFor: jest.fn(),
  historyWindow: jest.fn(async () => ({ since: new Date(0), limited: false })),
}));
jest.mock("../links", () => ({
  assertHttpUrl: (_field: string, url: string) => url,
  assertProjectInWorkspace: jest.fn(),
  assertTaskInWorkspace: jest.fn(),
  normalizeLinks: jest.fn(async () => []),
}));
jest.mock("../agents", () => ({ findAgentByRef: jest.fn(async () => null) }));
jest.mock("../alerts", () => ({ pushOwnerAlert: jest.fn() }));
jest.mock("../webhooks", () => ({
  emitHubEvent: jest.fn(),
  itemPayload: jest.fn(() => ({})),
}));
jest.mock("../metrics", () => ({ trackHub: jest.fn() }));

const grok = {
  id: "agent-grok",
  userId: "u1",
  workspaceId: "ws1",
  name: "Grok",
  kind: "grok",
  skills: ["browser"],
  limits: null,
  disabledAt: null,
} as unknown as HubAgent;

const scope: AgentScope = {
  userId: "u1",
  workspaceId: "ws1",
  actor: { kind: "agent", agent: grok },
} as AgentScope;

const brief = {
  title: "Post the weekly reel",
  goal: "Publish this week's reel to the brand account.",
  doneCriteria: "The reel is live and the link is in the result.",
  context: "The brand account is already logged in on the bot's browser.",
  risks: [],
  assignee: "any",
  requiredSkills: ["browser"],
};

beforeEach(() => {
  rows.length = 0;
  events.length = 0;
  jest.clearAllMocks();
});

describe("idempotent create", () => {
  it("returns the first item for the same idempotencyKey: one task, not two", async () => {
    const first = await createItem(scope, {
      ...brief,
      idempotencyKey: "reel-2026-w47",
    });
    const second = await createItem(scope, {
      ...brief,
      idempotencyKey: "reel-2026-w47",
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.item.id).toBe(first.item.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].clientRef).toBe("reel-2026-w47");
  });

  it("makes a second item for a different key", async () => {
    await createItem(scope, { ...brief, idempotencyKey: "a" });
    await createItem(scope, { ...brief, idempotencyKey: "b" });
    expect(rows).toHaveLength(2);
  });

  it("treats idempotencyKey and clientRef as one key", async () => {
    await createItem(scope, { ...brief, clientRef: "same" });
    const again = await createItem(scope, { ...brief, idempotencyKey: "same" });
    expect(again.created).toBe(false);
    expect(rows).toHaveLength(1);
  });

  it("prefers idempotencyKey when both are sent", () => {
    expect(
      withCreateKey({ clientRef: "old", idempotencyKey: "new" }).clientRef
    ).toBe("new");
    expect(withCreateKey({ clientRef: "old" }).clientRef).toBe("old");
  });

  it("keeps working without any key: every call creates an item", async () => {
    await createItem(scope, brief);
    await createItem(scope, brief);
    expect(rows).toHaveLength(2);
  });

  it("dedupes the owner's creates too", async () => {
    const owner: HubScope = {
      userId: "u1",
      workspaceId: "ws1",
      actor: { kind: "owner" },
    };
    await createItem(owner, { ...brief, idempotencyKey: "k" });
    const again = await createItem(owner, { ...brief, idempotencyKey: "k" });
    expect(again.created).toBe(false);
    expect(rows).toHaveLength(1);
  });

  it("returns the first answer for a recurring create before any gate runs", async () => {
    const first = await createItem(scope, {
      ...brief,
      idempotencyKey: "weekly",
    });
    // No Pro gate or recurrence mock is set up: a retry must not reach them.
    const retry = await createItemWithRecurrence(scope, {
      ...brief,
      idempotencyKey: "weekly",
      recurrence: { rrule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9" },
    });
    expect(retry).toMatchObject({ created: false, recurrence: null });
    expect(retry.item.id).toBe(first.item.id);
    expect(rows).toHaveLength(1);
  });

  it("accepts the new parameter without changing the old schema", () => {
    expect(createItemInput.safeParse(brief).success).toBe(true);
    expect(
      createItemInput.safeParse({ ...brief, idempotencyKey: "x".repeat(101) })
        .success
    ).toBe(false);
  });
});

describe("idempotent complete", () => {
  async function claimed() {
    const made = await createItem(scope, brief);
    const row = rows.find((candidate) => candidate.id === made.item.id)!;
    Object.assign(row, {
      status: "in_progress",
      claimedByAgentId: grok.id,
      leaseExpiresAt: newDate(Date.now() + 60_000),
    });
    return row;
  }

  const finish = {
    outcome: "done" as const,
    result: { summary: "Reel is live." },
    criteriaMet: true,
  };

  it("completes once and answers the retry with the same item, no error", async () => {
    const row = await claimed();
    const first = await completeItem(scope, {
      ...finish,
      id: row.id,
      idempotencyKey: "done-1",
    });
    const completions = events.filter((event) => event.type === "completed");
    expect(first).not.toHaveProperty("replayed");
    expect(row.status).toBe("done");
    expect(row.completionKey).toBe("done-1");
    const versionAfterFirst = row.version;

    const second = await completeItem(scope, {
      ...finish,
      id: row.id,
      idempotencyKey: "done-1",
    });
    expect(second).toMatchObject({ replayed: true, item: { id: row.id } });
    expect(second.item.status).toBe("done");
    // Nothing was written the second time.
    expect(row.version).toBe(versionAfterFirst);
    expect(events.filter((event) => event.type === "completed")).toHaveLength(
      completions.length
    );
    expect(completions).toHaveLength(1);
  });

  it("without a key a second complete is still refused", async () => {
    const row = await claimed();
    await completeItem(scope, { ...finish, id: row.id });
    await expect(
      completeItem(scope, { ...finish, id: row.id })
    ).rejects.toMatchObject({ code: "TERMINAL" });
  });

  it("a different key on a finished item is not a replay", async () => {
    const row = await claimed();
    await completeItem(scope, { ...finish, id: row.id, idempotencyKey: "a" });
    await expect(
      completeItem(scope, { ...finish, id: row.id, idempotencyKey: "b" })
    ).rejects.toBeInstanceOf(HubError);
  });

  it("another agent with the same key does not get the first agent's result", async () => {
    const row = await claimed();
    await completeItem(scope, { ...finish, id: row.id, idempotencyKey: "k" });
    const other: AgentScope = {
      ...scope,
      actor: { kind: "agent", agent: { ...grok, id: "agent-other" } },
    } as AgentScope;
    await expect(
      completeItem(other, { ...finish, id: row.id, idempotencyKey: "k" })
    ).rejects.toBeInstanceOf(HubError);
  });

  it("when two completes race, the loser gets the winner's answer", async () => {
    const row = await claimed();
    // The loser read the item before the winner wrote: its version check fails.
    const original = hubItem.updateMany.getMockImplementation()!;
    hubItem.updateMany.mockImplementationOnce(async (args) => {
      await completeItem(scope, {
        ...finish,
        id: row.id,
        idempotencyKey: "race",
      });
      return original(args);
    });
    const loser = await completeItem(scope, {
      ...finish,
      id: row.id,
      idempotencyKey: "race",
    });
    expect(loser).toMatchObject({ replayed: true });
    expect(events.filter((event) => event.type === "completed")).toHaveLength(
      1
    );
  });
});
