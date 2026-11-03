/**
 * Webhook management and emitting: Pro gate, owner-only writes, workspace
 * isolation, the secret shown once and stored encrypted. No database.
 */
import type { HubWebhook } from "@prisma/client";

import { decryptSecret } from "@/lib/security/secret-encryption";

import type { AgentScope, HubScope } from "../context";
import {
  createWebhook,
  deleteWebhook,
  listDeliveries,
  listWebhooks,
  queueHubEvent,
  sendTestEvent,
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
  hubWebhookDelivery: { create: jest.fn(), findMany: jest.fn() },
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
    expect((await listWebhooks(owner())).allowed).toBe(false);
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
    await listWebhooks(owner("u1", "w1"));
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
    expect(Object.keys(webhookView(row()))).not.toContain("secret");
  });
});
