/**
 * An escalation or a "no capable agent" alert reaches the owner as a push and
 * an unread count, and never as a Needt task (owner decision 2026-11-03: the
 * hub is separate from the person's own tasks). No database: the prisma mock
 * has no `task` model at all, so any code path that still tried to create or
 * complete a task would throw.
 */
import type { HubAgent, HubItem } from "@prisma/client";

import { newDate } from "@/lib/date-utils";

import { markItemSeen, pushOwnerAlert, unreadCount } from "../alerts";
import type { AgentScope } from "../context";
import { escalateItem } from "../items";
import { raiseNoCapableAgent } from "../sweep";

const db = {
  tx: {
    hubItem: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    hubItemEvent: { create: jest.fn() },
  },
  hubItem: { count: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  hubThread: { count: jest.fn().mockResolvedValue(0) },
  hubAgent: { findMany: jest.fn() },
  hubItemEvent: { findMany: jest.fn() },
  hubItemLink: { findMany: jest.fn() },
  pushSubscription: { findMany: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return db;
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const getPrefs = jest.fn();
const shouldAlert = jest.fn();
jest.mock("@/services/notifications/preferences", () => ({
  getNotificationPrefs: (...args: unknown[]) => getPrefs(...args),
  shouldAlert: (...args: unknown[]) => shouldAlert(...args),
}));
const deliverPush = jest.fn();
jest.mock("@/services/reminders/reminder-delivery", () => ({
  deliverPush: (...args: unknown[]) => deliverPush(...args),
}));

const USER = "user-1";
const WORKSPACE = "ws-1";
const subscription = {
  id: "sub-1",
  endpoint: "https://push.example/1",
  p256dh: "k",
  auth: "a",
};

function agent(): HubAgent {
  return {
    id: "agent-1",
    userId: USER,
    workspaceId: WORKSPACE,
    connectionKey: "token:t1",
    name: "Grok Bot",
    kind: "grok",
    capabilities: "",
    skills: ["browser"],
    lastSeenAt: null,
    disabledAt: null,
    createdAt: newDate(),
    updatedAt: newDate(),
  };
}

function item(extra: Partial<HubItem> = {}): HubItem {
  return {
    id: "item-1",
    userId: USER,
    workspaceId: WORKSPACE,
    title: "Record the demo video",
    goal: "Record a two minute capture of the verification demo.",
    doneCriteria: "A public link",
    context: "x".repeat(50),
    links: [],
    risks: ["publish"],
    approvals: {},
    status: "claimed",
    assigneeAgentId: "agent-1",
    requiredSkills: [],
    creatorKind: "agent",
    creatorAgentId: "agent-9",
    claimedByAgentId: "agent-1",
    leaseExpiresAt: newDate(Date.now() + 60_000),
    leaseExpiredNotedAt: null,
    due: null,
    result: null,
    blockedOn: null,
    question: null,
    taskId: null,
    projectId: null,
    escalationTaskId: null,
    noAgentTaskId: null,
    ownerUnread: false,
    ownerAlertedAt: null,
    noAgentAlertedAt: null,
    clientRef: null,
    version: 3,
    createdAt: newDate(),
    updatedAt: newDate(),
    closedAt: null,
    ...extra,
  } as HubItem;
}

beforeEach(() => {
  jest.clearAllMocks();
  getPrefs.mockResolvedValue({});
  shouldAlert.mockReturnValue(true);
  deliverPush.mockResolvedValue(true);
  db.pushSubscription.findMany.mockResolvedValue([subscription]);
  db.hubAgent.findMany.mockResolvedValue([]);
  db.hubItemEvent.findMany.mockResolvedValue([]);
  db.hubItemLink.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation(async (work: (tx: unknown) => unknown) =>
    work(db.tx)
  );
});

describe("the hub never creates a Needt task", () => {
  it("has no task model in the test database, so any task write would throw", () => {
    expect("task" in db).toBe(false);
    expect("task" in db.tx).toBe(false);
  });
});

describe("escalateItem", () => {
  it("alerts the owner (unread + push to /agents?item=<id>) and creates no task", async () => {
    const before = item();
    const after = item({
      status: "needs_owner",
      question: "Which account?",
      claimedByAgentId: null,
      ownerUnread: true,
      version: 4,
    });
    db.tx.hubItem.findFirst.mockResolvedValue(before);
    db.tx.hubItem.updateMany.mockResolvedValue({ count: 1 });
    db.tx.hubItem.findUniqueOrThrow.mockResolvedValue(after);

    const scope: AgentScope = {
      userId: USER,
      workspaceId: WORKSPACE,
      actor: { kind: "agent", agent: agent() },
    };
    const result = await escalateItem(scope, {
      id: "item-1",
      question: "Which account?",
      risk: "publish",
    });

    // Written onto the item, not onto a task.
    const write = db.tx.hubItem.updateMany.mock.calls[0][0];
    expect(write.data).toMatchObject({
      status: "needs_owner",
      ownerUnread: true,
    });
    expect(write.data.ownerAlertedAt).toBeInstanceOf(Date);
    expect(write.data).not.toHaveProperty("escalationTaskId");

    // The log says what was asked, without a task id.
    const event = db.tx.hubItemEvent.create.mock.calls[0][0].data;
    expect(event.type).toBe("escalated");
    expect(event.data).toEqual({ risk: "publish" });

    // One push, deep-linked to the item.
    expect(deliverPush).toHaveBeenCalledTimes(1);
    expect(deliverPush).toHaveBeenCalledWith(
      subscription,
      expect.objectContaining({ url: "/agents?item=item-1" })
    );
    expect(shouldAlert).toHaveBeenCalledWith(
      expect.anything(),
      "system",
      "push",
      expect.any(Date)
    );

    expect(result).not.toHaveProperty("ownerTaskId");
    expect(result.item.ownerUnread).toBe(true);
  });

  it("still escalates when the push cannot be sent", async () => {
    db.tx.hubItem.findFirst.mockResolvedValue(item());
    db.tx.hubItem.updateMany.mockResolvedValue({ count: 1 });
    db.tx.hubItem.findUniqueOrThrow.mockResolvedValue(
      item({ status: "needs_owner", ownerUnread: true })
    );
    deliverPush.mockRejectedValue(new Error("push provider down"));

    const result = await escalateItem(
      {
        userId: USER,
        workspaceId: WORKSPACE,
        actor: { kind: "agent", agent: agent() },
      },
      { id: "item-1", question: "Proceed?" }
    );
    expect(result.item.status).toBe("needs_owner");
  });
});

describe("raiseNoCapableAgent", () => {
  function stale() {
    db.hubItem.findMany.mockResolvedValue([
      item({
        status: "open",
        assigneeAgentId: null,
        claimedByAgentId: null,
        requiredSkills: ["holo-camera"],
        createdAt: newDate(Date.now() - 25 * 60 * 60 * 1000),
      }),
    ]);
  }

  it("raises one alert after 24 hours: unread, event, push, no task", async () => {
    stale();
    db.tx.hubItem.updateMany.mockResolvedValue({ count: 1 });

    const raised = await raiseNoCapableAgent({
      userId: USER,
      workspaceId: WORKSPACE,
    });

    expect(raised).toBe(1);
    const guard = db.tx.hubItem.updateMany.mock.calls[0][0];
    expect(guard.where).toMatchObject({ noAgentAlertedAt: null });
    expect(guard.data).toMatchObject({ ownerUnread: true });
    expect(guard.data).not.toHaveProperty("noAgentTaskId");
    expect(db.tx.hubItemEvent.create.mock.calls[0][0].data.type).toBe(
      "no_capable_agent"
    );
    expect(deliverPush).toHaveBeenCalledWith(
      subscription,
      expect.objectContaining({ url: "/agents?item=item-1" })
    );
  });

  it("raises nothing, and pushes nothing, when another reader got there first", async () => {
    stale();
    db.tx.hubItem.updateMany.mockResolvedValue({ count: 0 });
    const raised = await raiseNoCapableAgent({
      userId: USER,
      workspaceId: WORKSPACE,
    });
    expect(raised).toBe(0);
    expect(deliverPush).not.toHaveBeenCalled();
  });

  it("leaves items alone that a registered agent can do, and legacy rows that already had a task", async () => {
    stale();
    db.hubAgent.findMany.mockResolvedValue([{ skills: ["holo-camera"] }]);
    expect(
      await raiseNoCapableAgent({ userId: USER, workspaceId: WORKSPACE })
    ).toBe(0);

    await raiseNoCapableAgent({ userId: USER, workspaceId: WORKSPACE });
    // Rows from before alerts (they have noAgentTaskId) are never picked.
    expect(db.hubItem.findMany.mock.calls[0][0].where).toMatchObject({
      noAgentTaskId: null,
      noAgentAlertedAt: null,
    });
  });
});

describe("the unread count", () => {
  it("counts live items with an unopened alert, in this workspace only", async () => {
    db.hubItem.count.mockResolvedValue(2);
    expect(await unreadCount({ userId: USER, workspaceId: WORKSPACE })).toBe(2);
    expect(db.hubItem.count).toHaveBeenCalledWith({
      where: {
        userId: USER,
        workspaceId: WORKSPACE,
        ownerUnread: true,
        status: { notIn: ["done", "failed", "cancelled"] },
      },
    });
  });

  it("marks one item seen without touching its version", async () => {
    db.hubItem.updateMany.mockResolvedValue({ count: 1 });
    expect(
      await markItemSeen({ userId: USER, workspaceId: WORKSPACE }, "item-1")
    ).toBe(true);
    expect(db.hubItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: "item-1",
        userId: USER,
        workspaceId: WORKSPACE,
        ownerUnread: true,
      },
      data: { ownerUnread: false },
    });
    db.hubItem.updateMany.mockResolvedValue({ count: 0 });
    expect(
      await markItemSeen({ userId: USER, workspaceId: WORKSPACE }, "item-1")
    ).toBe(false);
  });
});

describe("pushOwnerAlert", () => {
  it("follows Settings, Notifications: no push when the system channel is off", async () => {
    shouldAlert.mockReturnValue(false);
    const result = await pushOwnerAlert(USER, {
      title: "An agent needs you",
      body: "Grok Bot: Record the demo video",
      itemId: "item-1",
    });
    expect(result).toEqual({ sent: 0, skipped: true });
    expect(deliverPush).not.toHaveBeenCalled();
  });

  it("flattens and caps text an agent wrote before it reaches a lock screen", async () => {
    await pushOwnerAlert(USER, {
      title: "An agent needs you",
      body: `line one\n\nline two ${"y".repeat(400)}`,
      itemId: "item-1",
    });
    const payload = deliverPush.mock.calls[0][1];
    expect(payload.body).not.toContain("\n");
    expect(payload.body.length).toBeLessThanOrEqual(140);
  });

  it("never throws", async () => {
    getPrefs.mockRejectedValue(new Error("db down"));
    await expect(
      pushOwnerAlert(USER, { title: "t", body: "b", itemId: "item-1" })
    ).resolves.toEqual({ sent: 0, skipped: false });
  });
});
