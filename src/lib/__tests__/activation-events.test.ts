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
    activationEvent: { findFirst: jest.fn(), create: jest.fn() },
  },
}));
jest.mock("@/lib/umami-server", () => ({ sendUmamiEvent: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const db = prisma as unknown as {
  user: { findUnique: jest.Mock };
  activationEvent: { findFirst: jest.Mock; create: jest.Mock };
};
const send = sendUmamiEvent as jest.Mock;

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ role: "user", sandboxKind: null });
  db.activationEvent.findFirst.mockResolvedValue(null);
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

  it("with once, records only the first occurrence", async () => {
    db.activationEvent.findFirst.mockResolvedValue({ id: "x" });
    recordActivation("calendar_connected", "u", {}, { once: true });
    await flush();
    expect(db.activationEvent.create).not.toHaveBeenCalled();
  });

  it("never throws or rejects when the database fails", async () => {
    db.activationEvent.create.mockRejectedValue(new Error("down"));
    expect(() => recordActivation("task_created", "u")).not.toThrow();
    await flush();
    expect(send).not.toHaveBeenCalled();
  });
});
