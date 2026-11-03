/**
 * Recurring hub items: the Pro gate, the idempotent spawn, the overlap rule and
 * the open-item limit. The database is mocked; the SQL lock is checked by text.
 */
import type { HubRecurrence } from "@prisma/client";

import {
  canAddToHub,
  canUseHubRecurring,
  hubHistoryWindow,
} from "@/lib/entitlements";
import { agentHubEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

import type { HubScope } from "../context";
import { HubError } from "../errors";
import {
  createItemWithRecurrence,
  processDueRecurrence,
  spawnDueRecurrences,
  updateRecurrence,
} from "../recurrences";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    userSettings: { findUnique: jest.fn() },
    hubRecurrence: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    hubAgent: { findMany: jest.fn(), findUnique: jest.fn() },
    hubItem: { findFirst: jest.fn(), create: jest.fn() },
    hubItemEvent: { findMany: jest.fn(), create: jest.fn() },
    hubItemLink: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/lib/feature-flags", () => ({ agentHubEnabled: jest.fn() }));
jest.mock("@/lib/entitlements", () => ({
  canUseHubRecurring: jest.fn(),
  canAddToHub: jest.fn(),
  hubHistoryWindow: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock("../metrics", () => ({ trackHub: jest.fn() }));

const recurring = canUseHubRecurring as jest.Mock;
const canAdd = canAddToHub as jest.Mock;
const hubOn = agentHubEnabled as jest.Mock;
const db = prisma as unknown as {
  userSettings: { findUnique: jest.Mock };
  hubRecurrence: Record<string, jest.Mock>;
  hubAgent: { findMany: jest.Mock; findUnique: jest.Mock };
  hubItem: { findFirst: jest.Mock; create: jest.Mock };
  $transaction: jest.Mock;
};

const NOW = new Date("2026-11-09T14:05:00Z"); // Monday 09:05 in New York
const DUE = new Date("2026-11-09T14:00:00Z");

function recurrence(patch: Partial<HubRecurrence> = {}): HubRecurrence {
  return {
    id: "rec1",
    userId: "u1",
    workspaceId: "ws1",
    title: "Collect weekly metrics",
    goal: "Pull last week's numbers into the metrics page.",
    doneCriteria: "The metrics page shows last week.",
    criteriaItems: [],
    context: "Dashboards are behind the browser login the agent already has.",
    links: [],
    risks: [],
    assigneeAgentId: null,
    requiredSkills: ["browser"],
    creatorKind: "owner",
    creatorAgentId: null,
    rrule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9",
    timezone: "America/New_York",
    nextRunAt: DUE,
    active: true,
    allowOverlap: false,
    lastSpawnedItemId: null,
    lastSpawnedAt: null,
    spawnCount: 1,
    skipCount: 0,
    lastSkipReason: null,
    lastSkipAt: null,
    createdAt: new Date("2026-11-02T12:00:00Z"),
    updatedAt: new Date("2026-11-02T12:00:00Z"),
    ...patch,
  } as HubRecurrence;
}

/** The transaction client the processor writes through. */
function tx() {
  return {
    hubItem: db.hubItem,
    hubRecurrence: db.hubRecurrence,
    hubAgent: db.hubAgent,
    hubItemEvent: { create: jest.fn() },
    $queryRaw: jest.fn(),
  };
}

const owner: HubScope = {
  userId: "u1",
  workspaceId: "ws1",
  actor: { kind: "owner" },
};

beforeEach(() => {
  jest.resetAllMocks();
  hubOn.mockResolvedValue(true);
  recurring.mockResolvedValue({ allowed: true, upgradeRequired: false });
  canAdd.mockResolvedValue({
    allowed: true,
    limit: null,
    used: 3,
    plan: "PRO",
    upgradeRequired: false,
  });
  (hubHistoryWindow as jest.Mock).mockResolvedValue({
    days: 90,
    limited: false,
  });
  db.hubItem.findFirst.mockResolvedValue(null);
  db.hubItem.create.mockImplementation(async ({ data }) => ({
    id: "item2",
    ...data,
  }));
  db.hubRecurrence.update.mockResolvedValue({});
  db.userSettings.findUnique.mockResolvedValue({
    timeZone: "America/New_York",
  });
});

describe("spawn", () => {
  it("opens a fresh item from the template and moves nextRunAt to the next Monday", async () => {
    const t = tx();
    const outcome = await processDueRecurrence(t as never, recurrence(), NOW);
    expect(outcome).toEqual({ kind: "spawned", itemId: "item2" });
    const data = db.hubItem.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      title: "Collect weekly metrics",
      status: "open",
      requiredSkills: ["browser"],
      recurrenceId: "rec1",
      occurrenceAt: DUE,
      clientRef: `recurrence:rec1:${DUE.toISOString()}`,
    });
    expect(t.hubItemEvent.create).toHaveBeenCalledTimes(1);
    const update = db.hubRecurrence.update.mock.calls[0][0].data;
    expect(update.lastSpawnedItemId).toBe("item2");
    expect(update.nextRunAt.toISOString()).toBe("2026-11-16T14:00:00.000Z");
    expect(update.active).toBe(true);
  });

  it("keeps 09:00 local when the next Monday is after the clock change", async () => {
    // Monday 2027-03-08 09:00 EST; the following Monday 2027-03-15 is EDT.
    const due = new Date("2027-03-08T14:00:00Z");
    await processDueRecurrence(
      tx() as never,
      recurrence({ nextRunAt: due }),
      new Date("2027-03-08T14:01:00Z")
    );
    const update = db.hubRecurrence.update.mock.calls[0][0].data;
    expect(update.nextRunAt.toISOString()).toBe("2027-03-15T13:00:00.000Z");
  });

  it("is idempotent: an occurrence already opened is not opened again", async () => {
    db.hubItem.findFirst.mockResolvedValueOnce({ id: "item-existing" });
    const outcome = await processDueRecurrence(
      tx() as never,
      recurrence(),
      NOW
    );
    expect(outcome).toEqual({ kind: "spawned", itemId: "item-existing" });
    expect(db.hubItem.create).not.toHaveBeenCalled();
    expect(db.hubRecurrence.update.mock.calls[0][0].data).toMatchObject({
      lastSpawnedItemId: "item-existing",
    });
  });

  it("continues from the next occurrence after downtime instead of catching up", async () => {
    // Three Mondays missed: one item now, nextRunAt after `now`, not after DUE.
    const late = new Date("2026-11-30T20:00:00Z");
    await processDueRecurrence(tx() as never, recurrence(), late);
    expect(db.hubItem.create).toHaveBeenCalledTimes(1);
    const update = db.hubRecurrence.update.mock.calls[0][0].data;
    expect(update.nextRunAt.toISOString()).toBe("2026-12-07T14:00:00.000Z");
  });

  it("ends the series when the rule has no more occurrences", async () => {
    await processDueRecurrence(
      tx() as never,
      recurrence({ rrule: "FREQ=DAILY;COUNT=1;BYHOUR=9" }),
      NOW
    );
    const update = db.hubRecurrence.update.mock.calls[0][0].data;
    expect(update).toMatchObject({ nextRunAt: null, active: false });
  });
});

describe("overlap", () => {
  it("skips while the previous occurrence is still open", async () => {
    db.hubItem.findFirst
      .mockResolvedValueOnce(null) // this occurrence not opened yet
      .mockResolvedValueOnce({ id: "item1" }); // previous one is open
    const outcome = await processDueRecurrence(
      tx() as never,
      recurrence(),
      NOW
    );
    expect(outcome).toEqual({ kind: "skipped", reason: "previous_open" });
    expect(db.hubItem.create).not.toHaveBeenCalled();
    const update = db.hubRecurrence.update.mock.calls[0][0].data;
    expect(update.lastSkipReason).toBe("previous_open");
    expect(update.skipCount).toEqual({ increment: 1 });
    // Still scheduled: the next Monday is tried again.
    expect(update.nextRunAt.toISOString()).toBe("2026-11-16T14:00:00.000Z");
  });

  it("looks only at unfinished items of this recurrence", async () => {
    await processDueRecurrence(tx() as never, recurrence(), NOW);
    const overlapQuery = db.hubItem.findFirst.mock.calls[1][0].where;
    expect(overlapQuery.recurrenceId).toBe("rec1");
    expect(overlapQuery.status.notIn).toEqual(
      expect.arrayContaining(["done", "failed", "cancelled"])
    );
  });

  it("opens another occurrence next to an open one when allowOverlap is true", async () => {
    db.hubItem.findFirst.mockResolvedValue(null);
    const outcome = await processDueRecurrence(
      tx() as never,
      recurrence({ allowOverlap: true }),
      NOW
    );
    expect(outcome.kind).toBe("spawned");
    // Only the idempotency lookup ran; the overlap lookup was not needed.
    expect(db.hubItem.findFirst).toHaveBeenCalledTimes(1);
  });
});

describe("plan", () => {
  it("skips and records why when the person is no longer on Pro", async () => {
    recurring.mockResolvedValue({ allowed: false, upgradeRequired: true });
    const outcome = await processDueRecurrence(
      tx() as never,
      recurrence(),
      NOW
    );
    expect(outcome).toEqual({ kind: "skipped", reason: "plan" });
    expect(db.hubItem.create).not.toHaveBeenCalled();
    expect(db.hubRecurrence.update.mock.calls[0][0].data).toMatchObject({
      lastSkipReason: "plan",
    });
  });

  it("respects the open-item limit: skips with plan_limit instead of creating", async () => {
    canAdd.mockResolvedValue({
      allowed: false,
      limit: 30,
      used: 30,
      plan: "FREE",
      upgradeRequired: true,
    });
    const outcome = await processDueRecurrence(
      tx() as never,
      recurrence(),
      NOW
    );
    expect(outcome).toEqual({ kind: "skipped", reason: "plan_limit" });
    expect(db.hubItem.create).not.toHaveBeenCalled();
    const update = db.hubRecurrence.update.mock.calls[0][0].data;
    expect(update).toMatchObject({
      lastSkipReason: "plan_limit",
      skipCount: { increment: 1 },
    });
    expect(update.nextRunAt).toBeInstanceOf(Date);
  });

  it("skips when the assigned agent was disabled", async () => {
    db.hubAgent.findUnique.mockResolvedValue({
      id: "a1",
      disabledAt: new Date(),
    });
    const outcome = await processDueRecurrence(
      tx() as never,
      recurrence({ assigneeAgentId: "a1" }),
      NOW
    );
    expect(outcome).toEqual({
      kind: "skipped",
      reason: "assignee_unavailable",
    });
  });

  it("pauses a recurrence whose schedule cannot be read", async () => {
    const outcome = await processDueRecurrence(
      tx() as never,
      recurrence({ rrule: "FREQ=SECONDLY" }),
      NOW
    );
    expect(outcome).toEqual({ kind: "skipped", reason: "invalid_rule" });
    expect(db.hubRecurrence.update.mock.calls[0][0].data).toMatchObject({
      active: false,
      nextRunAt: null,
    });
  });
});

describe("Pro gate on create", () => {
  const brief = {
    title: "Collect weekly metrics",
    goal: "Pull last week's numbers into the metrics page.",
    doneCriteria: "The page shows last week.",
    context: "Dashboards are behind the login the agent already has here.",
    risks: [],
    assignee: "any",
    requiredSkills: ["browser"],
  };

  it("refuses on Free before writing anything", async () => {
    recurring.mockResolvedValue({
      allowed: false,
      upgradeRequired: true,
      plan: "FREE",
    });
    let error: unknown;
    try {
      await createItemWithRecurrence(owner, {
        ...brief,
        recurrence: { rrule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9" },
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(HubError);
    expect((error as HubError).code).toBe("PLAN_LIMIT");
    expect((error as HubError).extra).toMatchObject({
      resource: "recurrence",
      upgradeRequired: true,
    });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.hubRecurrence.create).not.toHaveBeenCalled();
  });

  it("creates the recurrence and links the first item on Pro", async () => {
    db.hubRecurrence.count.mockResolvedValue(0);
    db.hubAgent.findMany.mockResolvedValue([]);
    (prisma.hubItemEvent.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.hubItemLink.findMany as jest.Mock).mockResolvedValue([]);
    const inner = {
      hubItem: {
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: "item1",
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        })),
        update: jest.fn().mockImplementation(async ({ where, data }) => ({
          id: where.id,
          userId: "u1",
          workspaceId: "ws1",
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        })),
      },
      hubItemEvent: { create: jest.fn() },
      hubRecurrence: {
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: "rec-new",
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        })),
      },
    };
    db.$transaction.mockImplementation(async (work) => work(inner));
    db.hubRecurrence.findUnique.mockImplementation(async ({ where }) => ({
      ...recurrence(),
      id: where.id,
    }));
    const result = await createItemWithRecurrence(owner, {
      ...brief,
      recurrence: {
        rrule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9",
        timezone: "Europe/Kyiv",
      },
    });
    const made = inner.hubRecurrence.create.mock.calls[0][0].data;
    expect(made).toMatchObject({
      rrule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9",
      timezone: "Europe/Kyiv",
      allowOverlap: false,
      lastSpawnedItemId: "item1",
      requiredSkills: ["browser"],
    });
    expect(made.nextRunAt).toBeInstanceOf(Date);
    expect(inner.hubItem.update.mock.calls[0][0].data.recurrenceId).toBe(
      "rec-new"
    );
    expect(result).toMatchObject({ created: true });
  });
});

describe("agent permissions", () => {
  const agent = {
    kind: "agent",
    agent: { id: "a1", name: "Grok" },
  } as unknown as HubScope["actor"];

  it("lets an agent change only the recurrences it created", async () => {
    db.hubRecurrence.findFirst.mockResolvedValue(
      recurrence({ creatorKind: "owner", assigneeAgentId: "a1" })
    );
    await expect(
      updateRecurrence(
        { userId: "u1", workspaceId: "ws1", actor: agent },
        { id: "rec1", action: "pause" }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.hubRecurrence.update).not.toHaveBeenCalled();
  });

  it("lets the creator pause and delete", async () => {
    db.hubRecurrence.findFirst.mockResolvedValue(
      recurrence({ creatorKind: "agent", creatorAgentId: "a1" })
    );
    db.hubRecurrence.update.mockResolvedValue(
      recurrence({ creatorKind: "agent", creatorAgentId: "a1", active: false })
    );
    db.hubAgent.findMany.mockResolvedValue([]);
    const scope = { userId: "u1", workspaceId: "ws1", actor: agent };
    const paused = await updateRecurrence(scope, {
      id: "rec1",
      action: "pause",
    });
    expect(paused).toMatchObject({ recurrence: { state: "paused" } });
    await expect(
      updateRecurrence(scope, { id: "rec1", action: "delete" })
    ).resolves.toEqual({ deleted: true, id: "rec1" });
  });
});

describe("sweep", () => {
  it("takes due rows one at a time with FOR UPDATE SKIP LOCKED", async () => {
    const queries: string[] = [];
    const inner = {
      ...tx(),
      $queryRaw: jest
        .fn()
        .mockImplementationOnce(async (strings: TemplateStringsArray) => {
          queries.push(strings.join("?"));
          return [{ id: "rec1" }];
        })
        .mockImplementationOnce(async (strings: TemplateStringsArray) => {
          queries.push(strings.join("?"));
          return [];
        }),
    };
    db.$transaction.mockImplementation(async (work) => work(inner));
    db.hubRecurrence.findUnique.mockResolvedValue(recurrence());
    const result = await spawnDueRecurrences(NOW);
    expect(result).toEqual({ spawned: 1, skipped: 0 });
    expect(queries[0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(db.hubItem.create).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no recurrence is due", async () => {
    db.$transaction.mockImplementation(async (work) =>
      work({ ...tx(), $queryRaw: jest.fn().mockResolvedValue([]) })
    );
    await expect(spawnDueRecurrences(NOW)).resolves.toEqual({
      spawned: 0,
      skipped: 0,
    });
  });
});
