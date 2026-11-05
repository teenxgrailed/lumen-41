import { prisma } from "@/lib/prisma";

/** The flag the Agents route checks (`AGENT_HUB` in feature-flags-keys). */
const AGENT_HUB = "agent_hub";

/** Turn the agent hub on for one account, as the owner does from the console. */
export async function enableAgentHub(userId: string) {
  await prisma.featureFlag.upsert({
    where: { key: AGENT_HUB },
    create: { key: AGENT_HUB, enabled: false, rolloutPercentage: 0 },
    update: {},
  });
  await prisma.featureFlagOverride.upsert({
    where: { flagKey_userId: { flagKey: AGENT_HUB, userId } },
    create: { flagKey: AGENT_HUB, userId, enabled: true },
    update: { enabled: true },
  });
}

/**
 * A busy hub for the perf run: agents, items across every status, some of
 * them in progress (so agents count as working), some done (the Map's
 * results).
 */
export async function seedAgentHub(
  userId: string,
  workspaceId: string,
  { agents = 5, items = 40 } = {}
) {
  const now = Date.now();
  const made: { id: string }[] = [];
  for (let i = 0; i < agents; i++) {
    made.push(
      await prisma.hubAgent.create({
        data: {
          userId,
          workspaceId,
          connectionKey: `perf:${i}`,
          name: ["Claude", "Codex", "Grok", "Research bot", "Mail triage"][
            i % 5
          ],
          kind: "other",
          skills: ["writing", "research"],
          lastSeenAt: new Date(now - i * 4 * 60_000),
        },
      })
    );
  }
  const statuses = [
    "in_progress",
    "open",
    "needs_owner",
    "done",
    "claimed",
    "blocked",
  ];
  await prisma.hubItem.createMany({
    data: Array.from({ length: items }, (_, i) => {
      const status = statuses[i % statuses.length];
      return {
        userId,
        workspaceId,
        title: `Hub item ${i + 1}`,
        goal: "Seeded for the performance baseline.",
        doneCriteria: "Done",
        criteriaItems: ["Drafted", "Checked"],
        context: "",
        risks: [],
        status,
        creatorKind: "owner",
        assigneeAgentId: made[i % made.length].id,
        question: status === "needs_owner" ? "Which one?" : null,
        result:
          status === "done" ? { summary: `Finished item ${i + 1}` } : undefined,
        createdAt: new Date(now - i * 3_600_000),
      };
    }),
  });
}
