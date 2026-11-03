/**
 * Webhook management and emitting: Pro gate, owner-only writes, workspace
 * isolation, the secret shown once and stored encrypted. No database.
 */
import type { HubWebhook } from "@prisma/client";

import { decryptSecret } from "@/lib/security/secret-encryption";

import type { AgentScope, HubScope } from "../context";
import { attemptDelivery } from "../webhook-delivery";
import {
  DELIVERY_RETENTION_DAYS,
  MAX_PENDING_PER_WEBHOOK,
  PRUNE_BATCH_SIZE,
  PRUNE_MAX_BATCHES,
  createWebhook,
  deleteWebhook,
  itemPayload,
  listDeliveries,
  listWebhooks,
  maskWebhookUrl,
  messagePayload,
  processWebhookDelivery,
  queueHubEvent,
  sendTestEvent,
  sweepPendingDeliveries,
  updateWebhook,
  webhookView,
} from "../webhooks";

const db = {
  hubWebhook: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  hubWebhookDelivery: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
};
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return db;
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const canUse = jest.fn();
jest.mock("@/lib/entitlements", () => ({
  canUseHubWebhooks: (...args: unknown[]) => canUse(...args),
}));
const enqueue = jest.fn();
jest.mock("@/lib/queue/enqueue", () => ({
  enqueueHubWebhookDelivery: (...args: unknown[]) => enqueue(...args),
}));
jest.mock("../webhook-delivery", () => ({
  ...jest.requireActual("../webhook-delivery"),
  attemptDelivery: jest.fn(),
}));
jest.mock("@/services/imports/safe-fetch", () => {
  const actual = jest.requireActual("@/services/imports/safe-fetch");
  return {
    ...actual,
    // Names resolve to a public address; literal IPs are still judged for real.
    assertPublicHttpsUrl: (raw: string) =>
      actual.assertPublicHttpsUrl(raw, async () => ["93.184.216.34"]),
  };
});

const owner = (userId = "u1", workspaceId = "w1"): HubScope => ({
  userId,
  workspaceId,
  actor: { kind: "owner" },
});
const agent = {
  userId: "u1",
  workspaceId: "w1",
  actor: { kind: "agent", agent: { id: "a1", name: "Bot" } },
} as unknown as AgentScope;

const row = (over: Partial<HubWebhook> = {}): HubWebhook => ({
  id: "h1",
  userId: "u1",
  workspaceId: "w1",
  url: "https://hooks.example.com/x",
  secret: "enc:v1:x",
  events: ["item.created"],
  active: true,
  consecutiveFailures: 0,
  disabledReason: null,
  lastDeliveryAt: null,
  droppedCount: 0,
  lastDroppedAt: null,
  createdAt: new Date("2026-11-03T10:00:00Z"),
  updatedAt: new Date("2026-11-03T10:00:00Z"),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  canUse.mockResolvedValue({ allowed: true, upgradeRequired: false });
  db.hubWebhook.count.mockResolvedValue(0);
  db.hubWebhook.create.mockImplementation(async ({ data }) => row(data));
  db.hubWebhook.findMany.mockResolvedValue([]);
  enqueue.mockResolvedValue({ id: "job" });
  db.hubWebhookDelivery.count.mockResolvedValue(0);
  db.hubWebhookDelivery.update.mockResolvedValue({});
  db.hubWebhookDelivery.deleteMany.mockResolvedValue({ count: 0 });
  db.hubWebhookDelivery.create.mockImplementation(async ({ data }) => ({
    id: "d1",
    attempts: 0,
    lastError: null,
    lastStatus: null,
    createdAt: new Date(),
    ...data,
  }));
});

describe("Pro gate", () => {
  beforeEach(() =>
    canUse.mockResolvedValue({
      allowed: false,
      upgradeRequired: true,
      plan: "FREE",
    })
  );

  it("Free cannot add a webhook (402 PLAN_LIMIT)", async () => {
    await expect(
      createWebhook(owner(), {
        url: "https://hooks.example.com/x",
        events: ["item.created"],
      })
    ).rejects.toMatchObject({ code: "PLAN_LIMIT", status: 402 });
    expect(db.hubWebhook.create).not.toHaveBeenCalled();
  });

  it("Free cannot send a test or switch one on", async () => {
    db.hubWebhook.findFirst.mockResolvedValue(row({ active: false }));
    await expect(sendTestEvent(owner(), "h1")).rejects.toMatchObject({
      code: "PLAN_LIMIT",
    });
    await expect(
      updateWebhook(owner(), "h1", { active: true })
    ).rejects.toMatchObject({ code: "PLAN_LIMIT" });
  });

  it("Free can still see the list (locked) and remove what it has", async () => {
    expect((await listWebhooks(owner(), true)).allowed).toBe(false);
    db.hubWebhook.findFirst.mockResolvedValue(row());
    await expect(deleteWebhook(owner(), "h1")).resolves.toEqual({
      deleted: true,
    });
  });

  it("an event is not queued for a Free owner even if a webhook is left over", async () => {
    db.hubWebhook.findMany.mockResolvedValue([row()]);
    expect(
      await queueHubEvent(owner(), "item.created", { item: { id: "i" } })
    ).toBe(0);
    expect(db.hubWebhookDelivery.create).not.toHaveBeenCalled();
  });
});

describe("create", () => {
  it("returns the secret once and stores only ciphertext", async () => {
    const made = await createWebhook(owner(), {
      url: "https://hooks.example.com/x",
      events: ["item.created", "item.created", "message.created"],
    });
    expect(made.secret).toMatch(/^whsec_/);
    const stored = db.hubWebhook.create.mock.calls[0][0].data;
    expect(stored.secret).not.toContain(made.secret);
    expect(decryptSecret(stored.secret)).toBe(made.secret);
    expect(stored.events).toEqual(["item.created", "message.created"]);
    expect(JSON.stringify(made.webhook)).not.toContain(made.secret);
    expect(made.webhook).not.toHaveProperty("secret");
  });

  it("refuses private and non-https addresses", async () => {
    for (const url of ["http://hooks.example.com/x", "https://10.0.0.1/x"]) {
      await expect(
        createWebhook(owner(), { url, events: ["item.created"] })
      ).rejects.toMatchObject({ code: "INVALID" });
    }
    expect(db.hubWebhook.create).not.toHaveBeenCalled();
  });

  it("caps the webhooks of a workspace", async () => {
    db.hubWebhook.count.mockResolvedValue(10);
    await expect(
      createWebhook(owner(), {
        url: "https://hooks.example.com/x",
        events: ["item.created"],
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("is the owner's: an agent cannot create, change, remove or test", async () => {
    await expect(
      createWebhook(agent, {
        url: "https://hooks.example.com/x",
        events: ["item.created"],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      updateWebhook(agent, "h1", { active: false })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteWebhook(agent, "h1")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(sendTestEvent(agent, "h1")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("turning a switched-off webhook on resets its failures", async () => {
    db.hubWebhook.findFirst.mockResolvedValue(
      row({ active: false, consecutiveFailures: 20, disabledReason: "off" })
    );
    db.hubWebhook.update.mockResolvedValue(row());
    await updateWebhook(owner(), "h1", { active: true });
    expect(db.hubWebhook.update.mock.calls[0][0].data).toMatchObject({
      active: true,
      consecutiveFailures: 0,
      disabledReason: null,
    });
  });
});

describe("workspace isolation", () => {
  it("lists only the caller's user and workspace", async () => {
    await listWebhooks(owner("u1", "w1"), true);
    expect(db.hubWebhook.findMany.mock.calls[0][0].where).toEqual({
      userId: "u1",
      workspaceId: "w1",
    });
  });

  it("another workspace's webhook is NOT_FOUND for every owner action", async () => {
    db.hubWebhook.findFirst.mockResolvedValue(null);
    const other = owner("u1", "w2");
    for (const call of [
      () => updateWebhook(other, "h1", { active: false }),
      () => deleteWebhook(other, "h1"),
      () => sendTestEvent(other, "h1"),
      () => listDeliveries(other, "h1"),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect(db.hubWebhook.findFirst.mock.calls[0][0].where).toEqual({
      id: "h1",
      userId: "u1",
      workspaceId: "w2",
    });
    expect(db.hubWebhook.delete).not.toHaveBeenCalled();
    expect(db.hubWebhook.update).not.toHaveBeenCalled();
  });

  it("emitting looks up only active subscribers of that workspace", async () => {
    await queueHubEvent(owner("u1", "w1"), "item.claimed", {});
    expect(db.hubWebhook.findMany.mock.calls[0][0].where).toEqual({
      userId: "u1",
      workspaceId: "w1",
      active: true,
      events: { has: "item.claimed" },
    });
  });

  it("queues one signed-later delivery per subscribed webhook and enqueues it", async () => {
    db.hubWebhook.findMany.mockResolvedValue([
      row({ id: "h1" }),
      row({ id: "h2" }),
    ]);
    const n = await queueHubEvent(owner(), "item.created", {
      item: { id: "i1" },
    });
    expect(n).toBe(2);
    const data = db.hubWebhookDelivery.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ webhookId: "h1", event: "item.created" });
    expect(data.payload).toMatchObject({
      event: "item.created",
      workspaceId: "w1",
      data: { item: { id: "i1" } },
    });
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenCalledWith("d1", 1);
  });
});

describe("views", () => {
  it("never include the secret", () => {
    expect(Object.keys(webhookView(row(), true))).not.toContain("secret");
  });
});

describe("what agents see (M1)", () => {
  it("masks the path: n8n, Zapier and Make carry the credential there", () => {
    expect(maskWebhookUrl("https://hooks.zapier.com/hooks/catch/1/abc/")).toBe(
      "https://hooks.zapier.com/…"
    );
    expect(maskWebhookUrl("https://n8n.example.com/webhook/uuid?token=t")).toBe(
      "https://n8n.example.com/…"
    );
    expect(maskWebhookUrl("https://example.com/")).toBe("https://example.com");
    expect(maskWebhookUrl("nonsense")).toBe("");
  });

  it("the owner's list has the full address, an agent's list only the origin", async () => {
    db.hubWebhook.findMany.mockResolvedValue([
      row({ url: "https://hooks.zapier.com/hooks/catch/1/secretpath/" }),
    ]);
    const owners = await listWebhooks(owner(), true);
    expect(owners.webhooks[0].url).toContain("secretpath");
    const agents = await listWebhooks(agent, false);
    expect(JSON.stringify(agents)).not.toContain("secretpath");
    expect(agents.webhooks[0].url).toBe("https://hooks.zapier.com/…");
  });
});

describe("volume and the queue (M4, L2)", () => {
  it("drops events for a webhook with a full backlog, but still sends a test", async () => {
    db.hubWebhook.findMany.mockResolvedValue([row()]);
    db.hubWebhookDelivery.count.mockResolvedValue(MAX_PENDING_PER_WEBHOOK);
    expect(await queueHubEvent(owner(), "item.created", {})).toBe(0);
    expect(db.hubWebhookDelivery.create).not.toHaveBeenCalled();
    expect(db.hubWebhookDelivery.count.mock.calls[0][0].where).toEqual({
      webhookId: "h1",
      status: "pending",
    });

    db.hubWebhook.findFirst.mockResolvedValue(row());
    await sendTestEvent(owner(), "h1");
    expect(db.hubWebhookDelivery.create).toHaveBeenCalledTimes(1);
  });

  it("records every drop on the webhook and logs once per window, not per event", async () => {
    const { logger } = jest.requireMock("@/lib/logger");
    db.hubWebhookDelivery.count.mockResolvedValue(MAX_PENDING_PER_WEBHOOK);
    db.hubWebhook.update.mockResolvedValue({});
    // First drop: never dropped before, so it logs.
    db.hubWebhook.findMany.mockResolvedValue([row()]);
    await queueHubEvent(owner(), "item.created", {});
    expect(db.hubWebhook.update.mock.calls[0][0]).toMatchObject({
      where: { id: "h1" },
      data: { droppedCount: { increment: 1 } },
    });
    expect(
      db.hubWebhook.update.mock.calls[0][0].data.lastDroppedAt
    ).toBeInstanceOf(Date);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    // Dropped a moment ago: counted again, not logged again.
    db.hubWebhook.findMany.mockResolvedValue([
      row({ lastDroppedAt: new Date() }),
    ]);
    await queueHubEvent(owner(), "item.created", {});
    expect(db.hubWebhook.update).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("shows the owner the drop count and when it last happened", () => {
    const view = webhookView(
      row({ droppedCount: 3, lastDroppedAt: new Date("2026-11-03T11:00:00Z") }),
      true
    );
    expect(view).toMatchObject({
      droppedCount: 3,
      lastDroppedAt: "2026-11-03T11:00:00.000Z",
    });
  });

  it("without a queue the delivery is failed, not left pending forever", async () => {
    db.hubWebhook.findMany.mockResolvedValue([row()]);
    enqueue.mockResolvedValue(null);
    await queueHubEvent(owner(), "item.created", {});
    expect(db.hubWebhookDelivery.update.mock.calls[0][0]).toMatchObject({
      where: { id: "d1" },
      data: { status: "failed", nextAttemptAt: null },
    });
  });
});

describe("processWebhookDelivery", () => {
  it("queues the next attempt with the retry delay and the next attempt number", async () => {
    (attemptDelivery as jest.Mock).mockResolvedValue({
      state: "retry",
      delayMs: 300_000,
      nextAttemptAt: new Date(),
    });
    db.hubWebhookDelivery.findUnique.mockResolvedValue({ attempts: 2 });
    await processWebhookDelivery("d1");
    expect(enqueue).toHaveBeenCalledWith("d1", 3, 300_000);
  });

  it("queues nothing after a success or a final failure", async () => {
    for (const outcome of [
      { state: "success" },
      { state: "failed", disabled: false },
    ]) {
      (attemptDelivery as jest.Mock).mockResolvedValue(outcome);
      await processWebhookDelivery("d1");
    }
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe("sweepPendingDeliveries", () => {
  it("re-queues a lost pending delivery as its next attempt", async () => {
    db.hubWebhookDelivery.findMany.mockResolvedValue([
      { id: "d1", attempts: 0 },
      { id: "d2", attempts: 3 },
    ]);
    const result = await sweepPendingDeliveries();
    expect(result.requeued).toBe(2);
    expect(enqueue).toHaveBeenCalledWith("d1", 1);
    expect(enqueue).toHaveBeenCalledWith("d2", 4);
  });

  it("only looks at pending deliveries whose time passed, never a future retry", async () => {
    const before = Date.now();
    await sweepPendingDeliveries();
    const where = db.hubWebhookDelivery.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("pending");
    const cutoff = where.nextAttemptAt.lt as Date;
    // Two minutes of grace: a retry due in the next minutes is left alone.
    expect(before - cutoff.getTime()).toBeGreaterThanOrEqual(2 * 60_000 - 50);
    expect(before - cutoff.getTime()).toBeLessThan(2 * 60_000 + 5_000);
  });

  it(`deletes finished deliveries older than ${DELIVERY_RETENTION_DAYS} days in batches, never pending ones`, async () => {
    const before = Date.now();
    const full = Array.from({ length: PRUNE_BATCH_SIZE }, (_, i) => ({
      id: `old${i}`,
    }));
    const prune = db.hubWebhookDelivery.findMany;
    prune
      .mockResolvedValueOnce([]) // the lost-delivery lookup
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([{ id: "last" }]);
    db.hubWebhookDelivery.deleteMany
      .mockResolvedValueOnce({ count: PRUNE_BATCH_SIZE })
      .mockResolvedValueOnce({ count: 1 });
    const result = await sweepPendingDeliveries();
    expect(result.pruned).toBe(PRUNE_BATCH_SIZE + 1);
    const query = prune.mock.calls[1][0];
    expect(query.where.status).toEqual({ not: "pending" });
    expect(query.take).toBe(PRUNE_BATCH_SIZE);
    expect(query.orderBy).toEqual({ createdAt: "asc" });
    const age = before - (query.where.createdAt.lt as Date).getTime();
    expect(age).toBeGreaterThanOrEqual(
      DELIVERY_RETENTION_DAYS * 86_400_000 - 50
    );
    expect(age).toBeLessThan(DELIVERY_RETENTION_DAYS * 86_400_000 + 5_000);
    // Deleted by id, a batch at a time: never one statement for the whole age.
    const where = db.hubWebhookDelivery.deleteMany.mock.calls[0][0].where;
    expect(where).toEqual({ id: { in: full.map((r) => r.id) } });
    expect(db.hubWebhookDelivery.deleteMany).toHaveBeenCalledTimes(2);
  });

  it("stops after the batch limit so one run stays bounded", async () => {
    const full = Array.from({ length: PRUNE_BATCH_SIZE }, (_, i) => ({
      id: `old${i}`,
    }));
    db.hubWebhookDelivery.findMany.mockResolvedValue(full);
    db.hubWebhookDelivery.deleteMany.mockResolvedValue({
      count: PRUNE_BATCH_SIZE,
    });
    const result = await sweepPendingDeliveries();
    // findMany serves the lost-delivery lookup once, then the prune batches.
    expect(db.hubWebhookDelivery.deleteMany).toHaveBeenCalledTimes(
      PRUNE_MAX_BATCHES
    );
    expect(result.pruned).toBe(PRUNE_BATCH_SIZE * PRUNE_MAX_BATCHES);
  });
});

describe("payload shape", () => {
  it("an item carries ids, status and the question only: no goal, context, criteria, result or notes", () => {
    const payload = itemPayload({
      id: "i1",
      title: "Upload",
      goal: "SECRET GOAL TEXT",
      context: "SECRET CONTEXT",
      doneCriteria: "SECRET CRITERIA",
      result: { summary: "SECRET RESULT" },
      status: "open",
      risks: ["publish"],
      assigneeAgentId: null,
      claimedByAgentId: null,
      creatorKind: "owner",
      creatorAgentId: null,
      due: null,
      question: "Ship it?",
    } as never);
    expect(Object.keys(payload).sort()).toEqual(
      [
        "claimedByAgentId",
        "assigneeAgentId",
        "creatorAgentId",
        "creatorKind",
        "due",
        "id",
        "question",
        "risks",
        "status",
        "title",
        "url",
      ].sort()
    );
    expect(JSON.stringify(payload)).not.toContain("SECRET");
  });

  it("a message carries its text and routing, nothing from the thread beyond subject and item", () => {
    const payload = messagePayload(
      {
        id: "m1",
        threadId: "t1",
        fromKind: "agent",
        fromAgentId: "a1",
        toAgentIds: [],
        toOwner: true,
        toAny: false,
        body: "hello",
        importance: "normal",
        ackRequired: false,
        // not part of the payload type; must never leak through
        userId: "SECRET-USER",
      } as never,
      { subject: "Hi", itemId: null }
    );
    expect(Object.keys(payload).sort()).toEqual(
      [
        "ackRequired",
        "body",
        "fromAgentId",
        "fromKind",
        "id",
        "importance",
        "itemId",
        "subject",
        "threadId",
        "toAgentIds",
        "toAny",
        "toOwner",
        "untrusted",
        "url",
      ].sort()
    );
    expect(payload.untrusted).toBe(true);
  });
});
