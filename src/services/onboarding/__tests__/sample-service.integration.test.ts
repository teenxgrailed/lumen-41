import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { SAMPLE_USES } from "../sample-content";
import {
  clearSampleData,
  sampleStatus,
  seedSampleData,
} from "../sample-service";

/**
 * Real Postgres (the migrations applied): the seed transaction writes every
 * object and Clear removes them without a foreign-key error, including the
 * parts the first-run day grows (habit completions, tasks a habit
 * materialised, blocks, subtasks). Run with SAMPLE_INTEGRATION=1 and
 * DATABASE_URL / DIRECT_URL pointing at a migrated database.
 */
const describeIntegration =
  process.env.SAMPLE_INTEGRATION === "1" ? describe : describe.skip;

describeIntegration("first-run sample day on Postgres", () => {
  const run = `${process.pid}-${newDate().getTime()}`;
  const userIds: string[] = [];

  async function account(label: string, seeded = false) {
    const user = await prisma.user.create({
      data: {
        email: `sample.${run}.${label}@example.test`,
        sampleSeededAt: seeded ? newDate() : null,
      },
      select: { id: true },
    });
    userIds.push(user.id);
    const workspace = await prisma.workspace.create({
      data: {
        name: "Personal Workspace",
        kind: WorkspaceKind.PERSONAL,
        personalOwnerId: user.id,
        members: { create: { userId: user.id, role: WorkspaceRole.OWNER } },
      },
      select: { id: true },
    });
    await prisma.userSettings.create({
      data: { userId: user.id, timeZone: "Europe/Berlin" },
    });
    return { userId: user.id, workspaceId: workspace.id };
  }

  const counts = (userId: string) =>
    Promise.all([
      prisma.project.count({ where: { userId } }),
      prisma.task.count({ where: { userId } }),
      prisma.taskPart.count({ where: { task: { userId } } }),
      prisma.page.count({ where: { userId } }),
      prisma.pageBlock.count({ where: { page: { userId } } }),
      prisma.habit.count({ where: { userId } }),
    ]);

  afterAll(async () => {
    for (const userId of userIds) {
      await prisma.task.deleteMany({ where: { userId } });
      await prisma.habit.deleteMany({ where: { userId } });
      await prisma.page.deleteMany({ where: { userId } });
      await prisma.project.deleteMany({ where: { userId } });
      await prisma.workspace.deleteMany({ where: { personalOwnerId: userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it.each(SAMPLE_USES)(
    "%s: seeds, survives a habit week and a completion, and clears clean",
    async (use) => {
      const a = await account(use);
      const res = await seedSampleData({ ...a, uses: [use] });
      expect(res).toMatchObject({
        created: true,
        use,
        counts: { tasks: 6, projects: 1, pages: 1, habits: 1 },
      });
      const [projects, tasks, parts, pages, blocks, habits] = await counts(
        a.userId
      );
      expect([projects, tasks, pages, habits]).toEqual([1, 6, 1, 1]);
      expect(parts).toBeGreaterThanOrEqual(3);
      expect(blocks).toBeGreaterThan(5);
      expect(
        await prisma.task.count({
          where: { userId: a.userId, isSample: true },
        })
      ).toBe(6);
      await expect(sampleStatus(a.userId)).resolves.toMatchObject({
        present: true,
      });

      // What using the sample day adds around it.
      const habit = await prisma.habit.findFirstOrThrow({
        where: { userId: a.userId },
      });
      await prisma.habitCompletion.create({
        data: { habitId: habit.id, date: newDate("2026-10-19T00:00:00Z") },
      });
      await prisma.task.create({
        data: {
          title: "Habit block",
          status: "todo",
          userId: a.userId,
          workspaceId: a.workspaceId,
          habitId: habit.id,
        },
      });
      const mine = await prisma.task.create({
        data: {
          title: "My own task",
          status: "todo",
          userId: a.userId,
          workspaceId: a.workspaceId,
          projectId: res.projectId,
        },
      });

      const removed = await clearSampleData({ userId: a.userId });
      expect(removed).toEqual({
        tasks: 7,
        projects: 1,
        pages: 1,
        habits: 1,
      });
      const after = await counts(a.userId);
      expect(after).toEqual([0, 1, 0, 0, 0, 0]);
      const survivor = await prisma.task.findUniqueOrThrow({
        where: { id: mine.id },
      });
      expect(survivor.projectId).toBeNull();
      await expect(sampleStatus(a.userId)).resolves.toMatchObject({
        present: false,
      });

      // Final: neither a repeat nor a call after Clear creates anything.
      expect((await seedSampleData({ ...a, uses: [use] })).created).toBe(false);
      expect(await counts(a.userId)).toEqual(after);
      await expect(clearSampleData({ userId: a.userId })).resolves.toEqual({
        tasks: 0,
        projects: 0,
        pages: 0,
        habits: 0,
      });
    }
  );

  it("two concurrent calls create one sample day", async () => {
    const a = await account("race");
    const results = await Promise.all([
      seedSampleData({ ...a, uses: ["work"] }),
      seedSampleData({ ...a, uses: ["work"] }),
    ]).catch(() => null);
    // Either one wins and the other reports created:false, or the loser's
    // transaction is rejected; never two days.
    if (results) expect(results.filter((r) => r.created)).toHaveLength(1);
    expect((await counts(a.userId))[1]).toBe(6);
  });

  it("an account stamped by the migration is never given examples", async () => {
    const a = await account("old", true);
    expect((await seedSampleData({ ...a, uses: ["work"] })).created).toBe(
      false
    );
    expect(await counts(a.userId)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
