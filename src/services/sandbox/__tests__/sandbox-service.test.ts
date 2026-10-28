import { hash } from "bcryptjs";

import { isFeatureEnabledForEveryone } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

import {
  SANDBOX_EVENTS,
  SANDBOX_HABITS,
  SANDBOX_MEMORIES,
  SANDBOX_TASKS,
} from "../sandbox-content";
import {
  SANDBOX_TOKEN_GRACE_MS,
  provisionSandboxAccount,
  provisionSandboxAccounts,
  resetSandboxAccount,
  resetSandboxAccounts,
  sandboxConfigsFromEnv,
} from "../sandbox-service";

/**
 * Every model is a bag of jest.fn()s made on first touch, so the service can
 * call whatever it needs; the tests look at the calls that matter.
 */
jest.mock("@/lib/prisma", () => {
  const models: Record<string, Record<string, jest.Mock>> = {};
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get(_target, method: string) {
          models[name] ??= {};
          models[name][method] ??= jest
            .fn()
            .mockResolvedValue(
              method.endsWith("Many") ? { count: 0 } : { id: `${name}-id` }
            );
          return models[name][method];
        },
      }
    );
  const client: Record<string, unknown> = new Proxy(
    { __models: models },
    {
      get(target, key: string) {
        if (key === "__models") return models;
        if (key === "$transaction") {
          return (target as Record<string, unknown>).$transaction;
        }
        return model(key);
      },
    }
  );
  (client as { __models: unknown }).__models = models;
  return {
    prisma: Object.assign(client, {
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(client)),
    }),
  };
});
jest.mock("@/lib/feature-flags", () => ({
  isFeatureEnabledForEveryone: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const models = (
  prisma as unknown as { __models: Record<string, Record<string, jest.Mock>> }
).__models;
const call = (name: string, method: string) =>
  (prisma as unknown as Record<string, Record<string, jest.Mock>>)[name][
    method
  ];
const flag = isFeatureEnabledForEveryone as jest.MockedFunction<
  typeof isFeatureEnabledForEveryone
>;

const NOW = new Date("2026-10-28T09:00:00.000Z");
const PASSWORD = "correct horse battery";
const CONFIG = {
  kind: "reviewer" as const,
  email: "reviewer@needt.test",
  password: PASSWORD,
  name: "Needt Reviewer",
};
const ENV = {
  SANDBOX_REVIEWER_EMAIL: " Reviewer@Needt.test ",
  SANDBOX_REVIEWER_PASSWORD: PASSWORD,
};

beforeEach(() => {
  jest.clearAllMocks();
  for (const name of Object.keys(models)) delete models[name];
  flag.mockResolvedValue(true);
});

describe("sandboxConfigsFromEnv", () => {
  it("is empty when the variables are unset", () => {
    expect(sandboxConfigsFromEnv({})).toEqual([]);
    expect(
      sandboxConfigsFromEnv({ SANDBOX_REVIEWER_EMAIL: "a@b.test" })
    ).toEqual([]);
  });

  it("refuses a short password", () => {
    expect(
      sandboxConfigsFromEnv({
        SANDBOX_REVIEWER_EMAIL: "a@b.test",
        SANDBOX_REVIEWER_PASSWORD: "short",
      })
    ).toEqual([]);
  });

  it("reads the reviewer account, email normalised", () => {
    expect(sandboxConfigsFromEnv(ENV)).toEqual([
      expect.objectContaining({
        kind: "reviewer",
        email: "reviewer@needt.test",
        password: PASSWORD,
      }),
    ]);
  });
});

describe("provisioning", () => {
  it("does nothing while the flag is off", async () => {
    flag.mockResolvedValue(false);
    await expect(provisionSandboxAccounts(ENV)).resolves.toEqual([]);
    expect(models.user?.findUnique).toBeUndefined();
  });

  it("does nothing without the env", async () => {
    await expect(provisionSandboxAccounts({})).resolves.toEqual([]);
    expect(flag).not.toHaveBeenCalled();
  });

  it("creates a verified Pro reviewer with a password and sample data", async () => {
    call("user", "findUnique").mockResolvedValueOnce(null);
    call("user", "create").mockResolvedValueOnce({ id: "sandbox-1" });
    call("workspace", "findUnique").mockResolvedValueOnce(null);
    call("workspace", "create").mockResolvedValueOnce({ id: "ws-1" });
    call("userSettings", "findUnique").mockResolvedValueOnce({
      timeZone: "UTC",
    });

    const outcome = await provisionSandboxAccount(CONFIG, NOW);

    expect(outcome).toEqual({
      kind: "reviewer",
      status: "created",
      userId: "sandbox-1",
    });
    const data = call("user", "create").mock.calls[0][0].data;
    expect(data).toMatchObject({
      email: "reviewer@needt.test",
      emailVerified: NOW,
      sandboxKind: "reviewer",
      role: "user",
      sampleSeededAt: NOW,
    });
    expect(data.accounts.create).toMatchObject({
      provider: "credentials",
      providerAccountId: "reviewer@needt.test",
    });
    expect(data.accounts.create.id_token).not.toBe(PASSWORD);
    expect(call("subscription", "upsert").mock.calls[0][0].create).toEqual({
      userId: "sandbox-1",
      plan: "PRO",
      status: "ACTIVE",
    });
    expect(call("task", "create")).toHaveBeenCalledTimes(SANDBOX_TASKS.length);
  });

  it("is idempotent: a second run with the same env changes nothing", async () => {
    const idToken = await hash(PASSWORD, 4);
    call("user", "findUnique").mockResolvedValueOnce({
      id: "sandbox-1",
      sandboxKind: "reviewer",
      role: "user",
      isActive: true,
      emailVerified: NOW,
      accounts: [{ id: "acc-1", id_token: idToken }],
    });
    call("workspace", "findUnique").mockResolvedValueOnce({ id: "ws-1" });

    const outcome = await provisionSandboxAccount(CONFIG, NOW);

    expect(outcome.status).toBe("unchanged");
    expect(models.user.create).toBeUndefined();
    expect(models.account?.update).toBeUndefined();
    expect(models.user.update).toBeUndefined();
    expect(models.task?.create).toBeUndefined();
  });

  it("takes a new password from the env and signs old sessions out", async () => {
    const idToken = await hash("an older password", 4);
    call("user", "findUnique").mockResolvedValueOnce({
      id: "sandbox-1",
      sandboxKind: "reviewer",
      role: "user",
      isActive: true,
      emailVerified: NOW,
      accounts: [{ id: "acc-1", id_token: idToken }],
    });

    const outcome = await provisionSandboxAccount(CONFIG, NOW);

    expect(outcome.status).toBe("updated");
    expect(call("account", "update").mock.calls[0][0].where).toEqual({
      id: "acc-1",
    });
    expect(call("user", "update").mock.calls[0][0].data).toMatchObject({
      sessionVersion: { increment: 1 },
    });
  });

  it("never turns a real account into a sandbox", async () => {
    call("user", "findUnique").mockResolvedValueOnce({
      id: "real-1",
      sandboxKind: null,
      role: "admin",
      isActive: true,
      emailVerified: NOW,
      accounts: [],
    });

    const outcome = await provisionSandboxAccount(CONFIG, NOW);

    expect(outcome.status).toBe("refused");
    expect(outcome.userId).toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("reset", () => {
  it("refuses an account that is not a sandbox", async () => {
    call("user", "findUnique").mockResolvedValueOnce({
      id: "real-1",
      sandboxKind: null,
    });
    await expect(resetSandboxAccount("real-1", NOW)).rejects.toThrow(
      "Only a sandbox account can be reset."
    );
    expect(models.task?.deleteMany).toBeUndefined();
  });

  it("wipes, reseeds and revokes connections older than a day", async () => {
    call("user", "findUnique").mockResolvedValue({
      id: "sandbox-1",
      sandboxKind: "reviewer",
    });
    call("oAuthToken", "updateMany").mockResolvedValueOnce({ count: 2 });
    call("workspace", "findUnique").mockResolvedValueOnce({ id: "ws-1" });
    call("userSettings", "findUnique").mockResolvedValueOnce({
      timeZone: "Europe/Berlin",
    });

    const result = await resetSandboxAccount("sandbox-1", NOW);

    expect(result.tokensRevoked).toBe(2);
    expect(call("oAuthToken", "updateMany").mock.calls[0][0]).toEqual({
      where: {
        userId: "sandbox-1",
        revokedAt: null,
        createdAt: { lt: new Date(NOW.getTime() - SANDBOX_TOKEN_GRACE_MS) },
      },
      data: { revokedAt: NOW },
    });
    expect(
      call("connectorSettings", "updateMany").mock.calls[0][0].data
    ).toEqual({ tokenHash: null, tokenPreview: null, tokenExpiresAt: null });
    for (const name of ["task", "habit", "goal", "page", "project"]) {
      expect(call(name, "deleteMany")).toHaveBeenCalledWith({
        where: { userId: "sandbox-1" },
      });
    }
    expect(call("calendarFeed", "deleteMany")).toHaveBeenCalledWith({
      where: { userId: "sandbox-1" },
    });
    expect(call("aiUsage", "deleteMany")).toHaveBeenCalled();
    // ...and the same planner again.
    expect(call("task", "create")).toHaveBeenCalledTimes(SANDBOX_TASKS.length);
    expect(call("calendarEvent", "create")).toHaveBeenCalledTimes(
      SANDBOX_EVENTS.length
    );
    expect(call("page", "create")).toHaveBeenCalledTimes(2);
    expect(call("habit", "create")).toHaveBeenCalledTimes(
      SANDBOX_HABITS.length
    );
    expect(call("goal", "create")).toHaveBeenCalledTimes(1);
    expect(call("agentMemory", "create")).toHaveBeenCalledTimes(
      SANDBOX_MEMORIES.length
    );
    const done = call("task", "create").mock.calls.filter(
      ([args]) => args.data.status === "completed"
    );
    expect(done).toHaveLength(1);
    const todayTasks = call("task", "create").mock.calls.filter(
      ([args]) =>
        args.data.scheduledStart instanceof Date &&
        args.data.scheduledStart.toISOString().startsWith("2026-10-28")
    );
    expect(todayTasks.length).toBeGreaterThanOrEqual(2);
  });

  it("does nothing while the flag is off", async () => {
    flag.mockResolvedValue(false);
    await expect(resetSandboxAccounts(ENV, NOW)).resolves.toEqual({
      enabled: false,
      provisioned: [],
      reset: [],
      failed: 0,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("resets only rows marked as sandboxes", async () => {
    call("user", "findMany").mockResolvedValueOnce([]);
    await resetSandboxAccounts({}, NOW);
    expect(call("user", "findMany")).toHaveBeenCalledWith({
      where: { sandboxKind: { not: null } },
      select: { id: true },
    });
  });
});
