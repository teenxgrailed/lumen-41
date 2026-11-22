import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { recordActivation } from "@/lib/activation-events";
import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

import { startingAnswers } from "../answers";
import { commitOnboarding } from "../server";

jest.mock("@/lib/activation-events", () => ({ recordActivation: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock("@/lib/entitlements", () => ({
  canCreateHabit: jest.fn(async () => ({ allowed: true, remaining: 5 })),
}));
jest.mock("@/lib/work-week-server", () => ({ saveWeekHours: jest.fn() }));
jest.mock("@/lib/work-schedules", () => ({
  ensureDefaultWorkSchedule: jest.fn(async () => ({ id: "sched-1" })),
}));
jest.mock("@/services/ops", () => ({ runOp: jest.fn() }));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUserDetailed: jest.fn(),
}));

/* Every delegate method resolves to a plausible row, so the commit runs end
   to end without a database. */
jest.mock("@/lib/prisma", () => {
  const row = { id: "row-1", timeZone: "Europe/Berlin" };
  const method = () => jest.fn(async () => ({ ...row }));
  const delegates = new Map<string, unknown>();
  const delegate = () =>
    new Proxy(
      {},
      {
        get(target: Record<string, unknown>, key: string) {
          if (!(key in target)) {
            target[key] = ["findMany"].includes(key)
              ? jest.fn(async () => [])
              : method();
          }
          return target[key];
        },
      }
    );
  return {
    prisma: new Proxy(
      {},
      {
        get(_t, key: string) {
          if (!delegates.has(key)) delegates.set(key, delegate());
          return delegates.get(key);
        },
      }
    ),
  };
});

const workspace: WorkspaceAccess = {
  enabled: true,
  workspaceId: "ws-1",
  workspaceKind: WorkspaceKind.PERSONAL,
  role: WorkspaceRole.OWNER,
  dataScope: { mode: "workspace", workspaceId: "ws-1" },
};

const run = () =>
  commitOnboarding({
    userId: "user-1",
    workspace,
    answers: startingAnswers(),
    timeZone: "Europe/Berlin",
    now: new Date("2026-10-21T10:00:00Z"),
  });

beforeEach(() => jest.clearAllMocks());

describe("commitOnboarding activation", () => {
  it("records task_created once, with source onboarding, after the commit", async () => {
    const result = await run();
    expect(result.tasks).toBeGreaterThan(0);
    expect(recordActivation).toHaveBeenCalledTimes(1);
    expect(recordActivation).toHaveBeenCalledWith("task_created", "user-1", {
      source: "onboarding",
    });
    const userUpdate = jest.mocked(prisma.user.update);
    expect(userUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(recordActivation).mock.invocationCallOrder[0]
    );
  });

  it("records nothing when the commit throws before it finishes", async () => {
    jest.mocked(prisma.user.update).mockRejectedValueOnce(new Error("db down"));
    await expect(run()).rejects.toThrow("db down");
    expect(recordActivation).not.toHaveBeenCalled();
  });
});
