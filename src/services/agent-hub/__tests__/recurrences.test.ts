/**
 * Recurring hub items: the Pro gate, the idempotent spawn, the overlap rule and
 * the open-item limit. The database is mocked; the SQL lock is checked by text.
 */
import type { HubItem, HubRecurrence } from "@prisma/client";

import {
  canAddToHub,
  canUseHubRecurring,
  hubHistoryWindow,
} from "@/lib/entitlements";
import { agentHubEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

import type { HubScope } from "../context";
import { HubError } from "../errors";
import { nextOccurrence } from "../recurrence-rule";
import {
  createItemWithRecurrence,
  expireStaleOccurrences,
  occurrenceExpired,
  occurrenceLeaseEnd,
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
    hubItem: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
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
  hubItem: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
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
    hubItemLink: { findMany: jest.fn().mockResolvedValue([]) },
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
  db.hubItem.findMany.mockResolvedValue([]);
  db.hubItem.updateMany.mockResolvedValue({ count: 1 });
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

/** An unfinished item of rec1, opened at `openedAt`, with a stored lease. */
function openItem(patch: Partial<HubItem> = {}): HubItem {
  const openedAt = new Date("2026-11-08T14:00:00Z");
  return {
    id: "item1",
    userId: "u1",
    workspaceId: "ws1",
    title: "Collect weekly metrics",
    status: "open",
    recurrenceId: "rec1",
    occurrenceAt: openedAt,
    occurrenceExpiresAt: new Date(openedAt.getTime() + DAY),
    claimedByAgentId: null,
    leaseExpiresAt: null,
    version: 4,
    createdAt: openedAt,
    ...patch,
  } as HubItem;
}

describe("overlap", () => {
  it("skips while the previous occurrence is still open and inside its lease", async () => {
    db.hubItem.findMany.mockResolvedValue([
      openItem({ occurrenceExpiresAt: new Date(NOW.getTime() + 60_000) }),
    ]);
    const outcome = await processDueRecurrence(
      tx() as never,
      recurrence(),
      NOW
    );
    expect(outcome).toEqual({ kind: "skipped", reason: "previous_open" });
    expect(db.hubItem.create).not.toHaveBeenCalled();
    expect(db.hubItem.updateMany).not.toHaveBeenCalled();
    const update = db.hubRecurrence.update.mock.calls[0][0].data;
    expect(update.lastSkipReason).toBe("previous_open");
    expect(update.skipCount).toEqual({ increment: 1 });
    // Still scheduled: the next Monday is tried again.
    expect(update.nextRunAt.toISOString()).toBe("2026-11-16T14:00:00.000Z");
  });

  it("looks only at unfinished items of this recurrence", async () => {
    await processDueRecurrence(tx() as never, recurrence(), NOW);
    const query = db.hubItem.findMany.mock.calls[0][0].where;
    expect(query.recurrenceId).toBe("rec1");
    expect(query.status.notIn).toEqual(
      expect.arrayContaining(["done", "failed", "cancelled"])
    );
  });

  it("opens another occurrence next to an open one when allowOverlap is true", async () => {
    db.hubItem.findMany.mockResolvedValue([
      openItem({ occurrenceExpiresAt: new Date(NOW.getTime() + 60_000) }),
    ]);
    const outcome = await processDueRecurrence(
      tx() as never,
      recurrence({ allowOverlap: true }),
      NOW
    );
    expect(outcome.kind).toBe("spawned");
    expect(db.hubItem.create).toHaveBeenCalledTimes(1);
  });
});

describe("occurrence lease", () => {
  it("an open expired occurrence does not block the next one", async () => {
    // Opened a week ago, never finished: the case that skipped 49 runs.
    const stale = openItem({
      occurrenceAt: new Date("2026-11-02T14:00:00Z"),
      createdAt: new Date("2026-11-02T14:00:00Z"),
      occurrenceExpiresAt: new Date("2026-11-03T14:00:00Z"),
    });
    db.hubItem.findMany.mockResolvedValue([stale]);
    const t = tx();
    const outcome = await processDueRecurrence(t as never, recurrence(), NOW);
    expect(outcome).toEqual({ kind: "spawned", itemId: "item2" });
    // The old one is closed as missed, conditional on the version it was read at.
    expect(db.hubItem.updateMany).toHaveBeenCalledWith({
      where: { id: "item1", version: 4 },
      data: expect.objectContaining({
        status: "cancelled",
        closedAt: NOW,
      }),
    });
    expect(t.hubItemEvent.create.mock.calls[0][0].data).toMatchObject({
      itemId: "item1",
      type: "occurrence_expired",
      fromStatus: "open",
      toStatus: "cancelled",
      actorKind: "system",
    });
    expect(db.hubItem.create).toHaveBeenCalledTimes(1);
    expect(db.hubRecurrence.update.mock.calls[0][0].data).toMatchObject({
      lastSpawnedItemId: "item2",
      spawnCount: { increment: 1 },
    });
  });

  it("closes the expired one even when allowOverlap is true", async () => {
    db.hubItem.findMany.mockResolvedValue([
      openItem({ occurrenceExpiresAt: new Date(NOW.getTime() - 1) }),
    ]);
    await processDueRecurrence(
      tx() as never,
      recurrence({ allowOverlap: true }),
      NOW
    );
    expect(db.hubItem.updateMany).toHaveBeenCalledTimes(1);
    expect(db.hubItem.create).toHaveBeenCalledTimes(1);
  });

  it("frees the open-item limit before checking it", async () => {
    db.hubItem.findMany.mockResolvedValue([
      openItem({ occurrenceExpiresAt: new Date(NOW.getTime() - 1) }),
    ]);
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
    // The limit still refuses (mocked), but the stale item was closed first.
    expect(outcome).toEqual({ kind: "skipped", reason: "plan_limit" });
    expect(db.hubItem.updateMany).toHaveBeenCalledTimes(1);
  });

  it("still blocks when another sweep closed the item first (version moved)", async () => {
    db.hubItem.findMany.mockResolvedValue([
      openItem({ occurrenceExpiresAt: new Date(NOW.getTime() - 1) }),
    ]);
    db.hubItem.updateMany.mockResolvedValue({ count: 0 });
    const t = tx();
    const outcome = await processDueRecurrence(t as never, recurrence(), NOW);
    expect(outcome).toEqual({ kind: "skipped", reason: "previous_open" });
    expect(t.hubItemEvent.create).not.toHaveBeenCalled();
  });

  it("an item under a live claim lease is never expired, however old", () => {
    const working = openItem({
      status: "in_progress",
      claimedByAgentId: "a1",
      leaseExpiresAt: new Date(NOW.getTime() + 20 * 60_000),
      occurrenceExpiresAt: new Date(NOW.getTime() - 60_000),
      createdAt: new Date(NOW.getTime() - 23 * HOUR),
    });
    expect(occurrenceExpired(working, NOW)).toBe(false);
    // Three days old, the agent still renews its claim: still not expired.
    expect(
      occurrenceExpired(
        {
          ...working,
          createdAt: new Date(NOW.getTime() - 72 * HOUR),
          occurrenceExpiresAt: new Date(NOW.getTime() - 48 * HOUR),
        },
        NOW
      )
    ).toBe(false);
    // A claim lease that ran out does not hold it.
    expect(
      occurrenceExpired(
        { ...working, leaseExpiresAt: new Date(NOW.getTime() - 1) },
        NOW
      )
    ).toBe(true);
  });

  it("never expires an item that waits on the owner or is blocked (H1)", () => {
    const past = new Date(NOW.getTime() - 3 * DAY);
    for (const status of ["needs_owner", "blocked"]) {
      expect(
        occurrenceExpired(
          openItem({
            status,
            occurrenceExpiresAt: past,
            createdAt: past,
            occurrenceAt: past,
          }),
          NOW
        )
      ).toBe(false);
    }
    // Also with no stored lease (a row from before leases existed).
    expect(
      occurrenceExpired(
        openItem({
          status: "needs_owner",
          occurrenceExpiresAt: null,
          createdAt: past,
          occurrenceAt: past,
        }),
        NOW
      )
    ).toBe(false);
    // An open, claimed or in_progress one with no live lease does expire.
    for (const status of ["open", "claimed", "in_progress"]) {
      expect(
        occurrenceExpired(
          openItem({ status, occurrenceExpiresAt: past, leaseExpiresAt: null }),
          NOW
        )
      ).toBe(true);
    }
  });

  it("an expired needs_owner occurrence keeps blocking: nothing is closed and its alert stays", async () => {
    db.hubItem.findMany.mockResolvedValue([
      openItem({
        status: "needs_owner",
        occurrenceExpiresAt: new Date(NOW.getTime() - 2 * DAY),
      }),
    ]);
    const outcome = await processDueRecurrence(
      tx() as never,
      recurrence(),
      NOW
    );
    expect(outcome).toEqual({ kind: "skipped", reason: "previous_open" });
    expect(db.hubItem.updateMany).not.toHaveBeenCalled();
  });

  it("closing an occurrence keeps who held it and the owner's unread mark", async () => {
    db.hubItem.findMany.mockResolvedValue([
      openItem({
        status: "claimed",
        claimedByAgentId: "a1",
        leaseExpiresAt: new Date(NOW.getTime() - 1),
        occurrenceExpiresAt: new Date(NOW.getTime() - 1),
      }),
    ]);
    const t = tx();
    await processDueRecurrence(t as never, recurrence(), NOW);
    const data = db.hubItem.updateMany.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("claimedByAgentId");
    expect(data).not.toHaveProperty("ownerUnread");
    expect(t.hubItemEvent.create.mock.calls[0][0].data.data).toMatchObject({
      heldBy: "a1",
    });
  });

  it("gives an item from before leases existed the plain 24 hours", () => {
    const legacy = openItem({
      occurrenceExpiresAt: null,
      occurrenceAt: new Date(NOW.getTime() - 25 * HOUR),
    });
    expect(occurrenceExpired(legacy, NOW)).toBe(true);
    expect(
      occurrenceExpired(
        { ...legacy, occurrenceAt: new Date(NOW.getTime() - 23 * HOUR) },
        NOW
      )
    ).toBe(false);
  });

  it("never expires a finished item", () => {
    expect(
      occurrenceExpired(
        openItem({
          status: "done",
          occurrenceExpiresAt: new Date(NOW.getTime() - DAY),
        }),
        NOW
      )
    ).toBe(false);
  });

  describe("lease = min(24 h, next fire)", () => {
    it("is 24 hours when the next fire is further away", () => {
      const next = new Date(NOW.getTime() + 7 * DAY);
      expect(occurrenceLeaseEnd(NOW, next)).toEqual(
        new Date(NOW.getTime() + DAY)
      );
    });

    it("is 24 hours when the series has no more occurrences", () => {
      expect(occurrenceLeaseEnd(NOW, null)).toEqual(
        new Date(NOW.getTime() + DAY)
      );
    });

    it("is the next fire when that comes sooner", () => {
      const next = new Date(NOW.getTime() + 6 * HOUR);
      expect(occurrenceLeaseEnd(NOW, next)).toEqual(next);
    });

    it("stays below the next fire on a 25 hour fall-back day (DST)", () => {
      // Daily 09:00 New York. Sat 2026-10-31 09:00 EDT, then Sun 2026-11-01
      // 09:00 EST: 25 wall-clock-to-wall-clock hours.
      const rule = "FREQ=DAILY;BYHOUR=9";
      const openedAt = new Date("2026-10-31T13:00:00Z");
      const next = nextOccurrence(rule, "America/New_York", openedAt, openedAt);
      expect(next?.toISOString()).toBe("2026-11-01T14:00:00.000Z");
      const lease = occurrenceLeaseEnd(openedAt, next);
      expect(lease.getTime()).toBe(openedAt.getTime() + DAY);
      expect(lease.getTime()).toBeLessThan(next!.getTime());
    });

    it("is the next fire on a 23 hour spring-forward day (DST)", () => {
      // Sat 2027-03-13 09:00 EST, then Sun 2027-03-14 09:00 EDT: 23 hours.
      const rule = "FREQ=DAILY;BYHOUR=9";
      const openedAt = new Date("2027-03-13T14:00:00Z");
      const next = nextOccurrence(rule, "America/New_York", openedAt, openedAt);
      expect(next?.toISOString()).toBe("2027-03-14T13:00:00.000Z");
      expect(occurrenceLeaseEnd(openedAt, next)).toEqual(next);
    });

    it("is stored on the occurrence the worker opens (weekly: 24 hours)", async () => {
      await processDueRecurrence(tx() as never, recurrence(), NOW);
      const data = db.hubItem.create.mock.calls[0][0].data;
      expect(data.occurrenceExpiresAt).toEqual(new Date(NOW.getTime() + DAY));
    });

    it("is stored on the occurrence the worker opens (twice a day: the next fire)", async () => {
      // 09:00 and 15:00 New York: due 14:00 UTC, next fire 20:00 UTC.
      await processDueRecurrence(
        tx() as never,
        recurrence({ rrule: "FREQ=DAILY;BYHOUR=9,15" }),
        NOW
      );
      const data = db.hubItem.create.mock.calls[0][0].data;
      expect(data.occurrenceExpiresAt).toEqual(
        new Date("2026-11-09T20:00:00.000Z")
      );
    });
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
    const link = inner.hubItem.update.mock.calls[0][0].data;
    expect(link.recurrenceId).toBe("rec-new");
    // The first occurrence gets its lease too: 24 hours (the next Monday is a week away).
    expect(
      link.occurrenceExpiresAt.getTime() - link.occurrenceAt.getTime()
    ).toBe(DAY);
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
    expect(result).toEqual({ spawned: 1, skipped: 0, expired: 0 });
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
      expired: 0,
    });
  });

  it("closes expired occurrences at the start of the sweep, before the next one is due", async () => {
    db.hubItem.findMany.mockResolvedValue([
      openItem({ occurrenceExpiresAt: new Date(NOW.getTime() - 1) }),
      // Inside its lease: left alone.
      openItem({
        id: "item-live",
        occurrenceExpiresAt: new Date(NOW.getTime() + HOUR),
      }),
    ]);
    const inner = tx();
    db.$transaction.mockImplementation(async (work) =>
      work({ ...inner, $queryRaw: jest.fn().mockResolvedValue([]) })
    );
    const result = await spawnDueRecurrences(NOW);
    expect(result).toEqual({ spawned: 0, skipped: 0, expired: 1 });
    const where = db.hubItem.findMany.mock.calls[0][0].where;
    expect(where.recurrenceId).toEqual({ not: null });
    // Only what can be closed: never needs_owner or blocked (H1)...
    expect(where.status).toEqual({ in: ["open", "claimed", "in_progress"] });
    expect(where.AND[0].OR).toEqual(
      expect.arrayContaining([{ occurrenceExpiresAt: { lte: NOW } }])
    );
    // ...and held items with a live claim lease are left out in SQL, so they
    // cannot fill the batch and starve the stale ones (L4).
    expect(where.AND[1].OR).toEqual([
      { status: "open" },
      { leaseExpiresAt: null },
      { leaseExpiresAt: { lte: NOW } },
    ]);
    expect(db.hubItem.updateMany).toHaveBeenCalledTimes(1);
    expect(db.hubItem.updateMany.mock.calls[0][0].where.id).toBe("item1");
  });

  it("still opens due occurrences when the expiry pass fails", async () => {
    db.hubItem.findMany.mockRejectedValueOnce(new Error("db down"));
    const inner = {
      ...tx(),
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: "rec1" }])
        .mockResolvedValueOnce([]),
    };
    db.$transaction.mockImplementation(async (work) => work(inner));
    db.hubRecurrence.findUnique.mockResolvedValue(recurrence());
    db.hubItem.findMany.mockResolvedValue([]);
    const result = await spawnDueRecurrences(NOW);
    expect(result).toMatchObject({ spawned: 1, expired: 0 });
  });
});

describe("expireStaleOccurrences", () => {
  it("returns zero when nothing has outlived its lease", async () => {
    await expect(expireStaleOccurrences(NOW)).resolves.toEqual({ expired: 0 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
