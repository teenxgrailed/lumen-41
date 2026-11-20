import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { sendUmamiEvent } from "@/lib/umami-server";

import {
  buildActivationPayload,
  isFounderRole,
  pseudonymousId,
  recordActivation,
} from "../activation-events";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    activationEvent: { createMany: jest.fn(), create: jest.fn() },
  },
}));
jest.mock("@/lib/umami-server", () => ({ sendUmamiEvent: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const db = prisma as unknown as {
  user: { findUnique: jest.Mock };
  activationEvent: { createMany: jest.Mock; create: jest.Mock };
};
const send = sendUmamiEvent as jest.Mock;

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ role: "user", sandboxKind: null });
  db.activationEvent.createMany.mockResolvedValue({ count: 1 });
  db.activationEvent.create.mockResolvedValue({});
});

describe("payload", () => {
  it("holds only the pseudonym, the founder flag and the given props", () => {
    const payload = buildActivationPayload("user_123", false, {
      source: "app",
    });
    expect(Object.keys(payload).sort()).toEqual(["isFounder", "source", "uid"]);
    expect(JSON.stringify(payload)).not.toContain("user_123");
  });

  it("uses a stable, truncated, per-account pseudonym", () => {
    expect(pseudonymousId("a")).toBe(pseudonymousId("a"));
    expect(pseudonymousId("a")).not.toBe(pseudonymousId("b"));
    expect(pseudonymousId("a")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("flags only admins as the founder", () => {
    expect(isFounderRole("admin")).toBe(true);
    expect(isFounderRole("user")).toBe(false);
    expect(isFounderRole(null)).toBe(false);
  });
});

describe("recordActivation", () => {
  it("stores a row and sends a PII-free event to the app website", async () => {
    recordActivation("task_created", "user_123", { source: "app" });
    await flush();
    expect(db.activationEvent.create).toHaveBeenCalledWith({
      data: { userId: "user_123", name: "task_created" },
    });
    const [name, data, target] = send.mock.calls[0];
    expect(name).toBe("task_created");
    expect(target).toBe("app");
    expect(data).toEqual({
      source: "app",
      uid: pseudonymousId("user_123"),
      isFounder: false,
    });
    expect(JSON.stringify(send.mock.calls)).not.toContain("user_123");
  });

  it("marks an admin account as the founder", async () => {
    db.user.findUnique.mockResolvedValue({ role: "admin", sandboxKind: null });
    recordActivation("keep_applied", "owner");
    await flush();
    expect(send.mock.calls[0][1]).toMatchObject({ isFounder: true });
  });

  it("ignores sandbox accounts and missing users", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      role: "user",
      sandboxKind: "reviewer",
    });
    recordActivation("task_created", "sandbox");
    db.user.findUnique.mockResolvedValueOnce(null);
    recordActivation("task_created", "gone");
    recordActivation("task_created", null);
    await flush();
    expect(db.activationEvent.create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("logs a debug line when it skips a sandbox account, and still writes nothing", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      role: "user",
      sandboxKind: "demo",
    });
    recordActivation("task_created", "sandbox");
    await flush();
    expect(logger.debug).toHaveBeenCalledWith(
      "Activation event skipped",
      { name: "task_created", reason: "sandbox" },
      "ActivationEvents"
    );
    expect(db.activationEvent.create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("test_qa_plus_account_sends_no_analytics_events", async () => {
    db.user.findUnique.mockResolvedValue({
      role: "user",
      sandboxKind: null,
      email: "QA+20261119@somedomain.com",
    });
    recordActivation("task_created", "qa_user");
    recordActivation("account_created", "qa_user");
    await flush();
    expect(db.activationEvent.create).not.toHaveBeenCalled();
    expect(db.activationEvent.createMany).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("once-events insert through the unique key and send only when they won", async () => {
    recordActivation("calendar_connected", "u", { provider: "google" });
    await flush();
    expect(db.activationEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "u",
          name: "calendar_connected",
          onceKey: "calendar_connected",
        },
      ],
      skipDuplicates: true,
    });
    expect(send).toHaveBeenCalledTimes(1);

    send.mockClear();
    db.activationEvent.createMany.mockResolvedValue({ count: 0 });
    recordActivation("calendar_connected", "u", { provider: "google" });
    recordActivation("account_created", "u");
    await flush();
    expect(send).not.toHaveBeenCalled();
  });

  it("the first-replan funnel events count once per account", async () => {
    recordActivation("first_replan_card_shown", "u");
    recordActivation("first_replan_skipped", "u");
    await flush();
    expect(db.activationEvent.create).not.toHaveBeenCalled();
    expect(db.activationEvent.createMany.mock.calls.map((c) => c[0])).toEqual([
      {
        data: [
          {
            userId: "u",
            name: "first_replan_card_shown",
            onceKey: "first_replan_card_shown",
          },
        ],
        skipDuplicates: true,
      },
      {
        data: [
          {
            userId: "u",
            name: "first_replan_skipped",
            onceKey: "first_replan_skipped",
          },
        ],
        skipDuplicates: true,
      },
    ]);
  });

  it("repeatable events set no onceKey", async () => {
    recordActivation("task_created", "u");
    await flush();
    expect(db.activationEvent.createMany).not.toHaveBeenCalled();
    expect(db.activationEvent.create).toHaveBeenCalledWith({
      data: { userId: "u", name: "task_created" },
    });
  });

  it("sends the pseudonym as the Umami distinct id", async () => {
    recordActivation("keep_applied", "u");
    await flush();
    expect(send.mock.calls[0][3]).toBe(pseudonymousId("u"));
  });

  it("never throws or rejects when the database fails", async () => {
    db.activationEvent.create.mockRejectedValue(new Error("down"));
    expect(() => recordActivation("task_created", "u")).not.toThrow();
    await flush();
    expect(send).not.toHaveBeenCalled();
  });
});
