import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import {
  markEmailVerifiedAndStartTrial,
  trialEmailKey,
} from "@/lib/trials/trial-service";

const describeIntegration =
  process.env.TRIAL_INTEGRATION === "1" ? describe : describe.skip;

describeIntegration("trial canonical-email concurrency", () => {
  const runId = `${process.pid}-${newDate().getTime()}`;
  const emails = [
    `needt.trial.${runId}+one@gmail.com`,
    `needttrial${runId}+two@googlemail.com`,
  ];

  afterAll(async () => {
    await prisma.trialGrant.deleteMany({
      where: { emailKey: trialEmailKey(`needttrial${runId}@gmail.com`) },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.$disconnect();
  });

  it("verifies both accounts but grants exactly one trial", async () => {
    const users = await Promise.all(
      emails.map((email) =>
        prisma.user.create({ data: { email }, select: { id: true } })
      )
    );

    const results = await Promise.all(
      users.map((user, index) =>
        markEmailVerifiedAndStartTrial({
          userId: user.id,
          email: emails[index],
          now: newDate("2026-09-16T12:00:00.000Z"),
        })
      )
    );

    expect(results.filter((result) => result.trial).length).toBe(1);
    await expect(
      prisma.user.count({
        where: {
          id: { in: users.map((user) => user.id) },
          emailVerified: { not: null },
        },
      })
    ).resolves.toBe(2);
    await expect(
      prisma.trialGrant.count({
        where: { emailKey: trialEmailKey(`needttrial${runId}@gmail.com`) },
      })
    ).resolves.toBe(1);
  });
});
