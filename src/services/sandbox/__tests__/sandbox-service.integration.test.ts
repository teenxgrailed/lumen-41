import { newDate } from "@/lib/date-utils";
import { SANDBOX_ACCOUNTS } from "@/lib/feature-flags-keys";
import { prisma } from "@/lib/prisma";

import {
  SANDBOX_DOCS,
  SANDBOX_EVENTS,
  SANDBOX_HABITS,
  SANDBOX_MEMORIES,
  SANDBOX_PROJECTS,
  SANDBOX_TASKS,
} from "../sandbox-content";
import {
  SANDBOX_TOKEN_GRACE_MS,
  provisionSandboxAccount,
  provisionSandboxAccounts,
  resetSandboxAccount,
  resetSandboxAccounts,
} from "../sandbox-service";

/**
 * Real Postgres (the migrations applied): provisioning twice makes one
 * account, and the reset deletes everything a reviewer could have made
 * without a foreign-key error, then writes the planner again. Run with
 * SANDBOX_INTEGRATION=1 and DATABASE_URL / DIRECT_URL pointing at a migrated
 * database.
 */
const describeIntegration =
  process.env.SANDBOX_INTEGRATION === "1" ? describe : describe.skip;

describeIntegration("sandbox accounts on Postgres", () => {
  const run = `${process.pid}-${newDate().getTime()}`;
  const email = `sandbox.${run}@example.test`;
  const realEmail = `real.${run}@example.test`;
  const password = "integration sandbox password";
  const env = {
    SANDBOX_REVIEWER_EMAIL: email,
    SANDBOX_REVIEWER_PASSWORD: password,
  };
  const config = {
    kind: "reviewer" as const,
    email,
    password,
    name: "Reviewer",
  };
  let flagBefore: { enabled: boolean; rolloutPercentage: number } | null = null;
  let clientId: string | null = null;

  beforeAll(async () => {
    flagBefore = await prisma.featureFlag.findUnique({
      where: { key: SANDBOX_ACCOUNTS },
      select: { enabled: true, rolloutPercentage: true },
    });
    await prisma.featureFlag.upsert({
      where: { key: SANDBOX_ACCOUNTS },
      create: { key: SANDBOX_ACCOUNTS, enabled: true, rolloutPercentage: 100 },
      update: { enabled: true, rolloutPercentage: 100 },
    });
  });

  afterAll(async () => {
    await prisma.oAuthToken.deleteMany({
      where: { user: { email: { in: [email, realEmail] } } },
    });
    if (clientId) {
      await prisma.oAuthClient.deleteMany({ where: { id: clientId } });
    }
    const users = await prisma.user.findMany({
      where: { email: { in: [email, realEmail] } },
      select: { id: true },
    });
    for (const { id } of users) {
      await prisma.$transaction(async (tx) => {
        const { wipeSandboxContent } = await import("../sandbox-service");
        await wipeSandboxContent(tx, id);
        await tx.workspaceMember.deleteMany({ where: { userId: id } });
        await tx.workspace.deleteMany({ where: { personalOwnerId: id } });
        await tx.user.delete({ where: { id } });
      });
    }
    if (flagBefore) {
      await prisma.featureFlag.update({
        where: { key: SANDBOX_ACCOUNTS },
        data: flagBefore,
      });
    } else {
      await prisma.featureFlag.deleteMany({ where: { key: SANDBOX_ACCOUNTS } });
    }
    await prisma.$disconnect();
  });

  const counts = (userId: string) =>
    Promise.all([
      prisma.project.count({ where: { userId } }),
      prisma.task.count({ where: { userId } }),
      prisma.calendarEvent.count({ where: { feed: { userId } } }),
      prisma.page.count({ where: { userId } }),
      prisma.habit.count({ where: { userId } }),
      prisma.goal.count({ where: { userId } }),
      prisma.agentMemory.count({ where: { userId } }),
    ]);
  const SEEDED = [
    SANDBOX_PROJECTS.length,
    SANDBOX_TASKS.length,
    SANDBOX_EVENTS.length,
    SANDBOX_DOCS.length,
    SANDBOX_HABITS.length,
    1,
    SANDBOX_MEMORIES.length,
  ];

  it("provisions once, however many times it runs", async () => {
    const [first] = await provisionSandboxAccounts(env);
    const [second] = await provisionSandboxAccounts(env);
    expect(first.status).toBe("created");
    expect(second).toMatchObject({ status: "unchanged", userId: first.userId });
    expect(await prisma.user.count({ where: { email } })).toBe(1);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: {
        id: true,
        sandboxKind: true,
        emailVerified: true,
        role: true,
        subscription: { select: { plan: true, status: true } },
        accounts: { select: { provider: true } },
      },
    });
    expect(user.sandboxKind).toBe("reviewer");
    expect(user.emailVerified).not.toBeNull();
    expect(user.role).toBe("user");
    expect(user.subscription).toEqual({ plan: "PRO", status: "ACTIVE" });
    expect(user.accounts).toEqual([{ provider: "credentials" }]);
    expect(await counts(user.id)).toEqual(SEEDED);
  });

  it("refuses to adopt or reset a real account", async () => {
    const real = await prisma.user.create({
      data: { email: realEmail, role: "admin" },
      select: { id: true },
    });
    const outcome = await provisionSandboxAccount({
      ...config,
      email: realEmail,
    });
    expect(outcome.status).toBe("refused");
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: real.id },
      select: { sandboxKind: true, role: true },
    });
    expect(after).toEqual({ sandboxKind: null, role: "admin" });
    await expect(resetSandboxAccount(real.id)).rejects.toThrow();
  });

  it("wipes what a reviewer made and seeds the planner again", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true, personalWorkspace: { select: { id: true } } },
    });
    const userId = user.id;
    const workspaceId = user.personalWorkspace!.id;
    const now = newDate();

    // What a reviewer leaves behind in a day.
    const master = await prisma.task.create({
      data: {
        userId,
        workspaceId,
        title: "Weekly review",
        status: "todo",
        isRecurring: true,
        recurrenceRule: "FREQ=WEEKLY",
      },
      select: { id: true },
    });
    await prisma.task.create({
      data: {
        userId,
        workspaceId,
        title: "Weekly review (instance)",
        status: "todo",
        recurrenceMasterId: master.id,
      },
    });
    const parent = await prisma.page.create({
      data: { userId, workspaceId, title: "Parent" },
      select: { id: true },
    });
    await prisma.page.create({
      data: { userId, workspaceId, title: "Child", parentId: parent.id },
    });
    await prisma.board.create({ data: { userId, workspaceId, name: "Board" } });
    await prisma.moodboard.create({
      data: { workspaceId, createdById: userId, title: "Mood" },
    });
    await prisma.aiUsage.create({
      data: { userId, yearMonth: "2026-10", actionCount: 9 },
    });

    const client = await prisma.oAuthClient.create({
      data: { clientId: `client-${run}`, kind: "dynamic", name: "Tester" },
      select: { id: true },
    });
    clientId = client.id;
    const old = new Date(now.getTime() - SANDBOX_TOKEN_GRACE_MS - 60_000);
    const token = (suffix: string, createdAt: Date) =>
      prisma.oAuthToken.create({
        data: {
          tokenHash: `hash-${run}-${suffix}`,
          type: "access",
          familyId: `family-${run}-${suffix}`,
          clientId: client.id,
          userId,
          scope: "needt.read needt.write",
          resource: "https://mcp.needt.test/mcp",
          workspaceId,
          expiresAt: new Date(now.getTime() + 3_600_000),
          createdAt,
        },
        select: { id: true },
      });
    const stale = await token("stale", old);
    const fresh = await token("fresh", now);

    const result = await resetSandboxAccounts(env, now);
    expect(result.failed).toBe(0);
    expect(result.reset.map((r) => r.userId)).toContain(userId);

    expect(await counts(userId)).toEqual(SEEDED);
    expect(await prisma.board.count({ where: { userId } })).toBe(0);
    expect(
      await prisma.moodboard.count({ where: { createdById: userId } })
    ).toBe(0);
    expect(await prisma.aiUsage.count({ where: { userId } })).toBe(0);
    const tokens = await prisma.oAuthToken.findMany({
      where: { id: { in: [stale.id, fresh.id] } },
      select: { id: true, revokedAt: true },
    });
    expect(tokens.find((t) => t.id === stale.id)?.revokedAt).not.toBeNull();
    expect(tokens.find((t) => t.id === fresh.id)?.revokedAt).toBeNull();

    // The account itself is kept: same id, still a Pro sandbox.
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        sandboxKind: true,
        subscription: { select: { plan: true } },
      },
    });
    expect(after).toEqual({
      sandboxKind: "reviewer",
      subscription: { plan: "PRO" },
    });
  });
});
