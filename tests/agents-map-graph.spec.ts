import { mapGraph } from "@/services/agent-hub/map-graph";
import { expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { enableAgentHub } from "./helpers/agent-hub";
import { createV3User, signInAs } from "./helpers/v3-user";

/**
 * The Map's activity counts on the real Postgres: the SQL groups each
 * agent's events by UTC day in the database, and one account never sees
 * another's. Checked through the service and through the owner's overview.
 */
const DAY = 24 * 60 * 60 * 1000;

async function hubWithEvents(
  userId: string,
  workspaceId: string,
  name: string,
  at: Date[]
) {
  const agent = await prisma.hubAgent.create({
    data: {
      userId,
      workspaceId,
      connectionKey: `graph-spec:${name}:${userId}`,
      name,
      kind: "other",
      skills: [],
    },
  });
  const item = await prisma.hubItem.create({
    data: {
      userId,
      workspaceId,
      title: `Graph spec item for ${name}`,
      goal: "Counted by the Map.",
      doneCriteria: "Done",
      criteriaItems: [],
      context: "",
      risks: [],
      status: "in_progress",
      creatorKind: "owner",
      assigneeAgentId: agent.id,
    },
  });
  await prisma.hubItemEvent.createMany({
    data: at.map((when) => ({
      itemId: item.id,
      at: when,
      actorKind: "agent",
      actorAgentId: agent.id,
      type: "progress",
    })),
  });
  return agent;
}

test.describe("Agents Map graph on Postgres", () => {
  test("counts per agent and UTC day, and keeps accounts apart", async ({
    page,
  }) => {
    const owner = await createV3User("map-graph");
    const other = await createV3User("map-graph-other");
    const now = new Date();
    const today = Math.floor(now.getTime() / DAY) * DAY;
    // Two events yesterday (UTC), one today, one outside the 7-day window.
    const mine = await hubWithEvents(owner.id, owner.workspaceId, "Claude", [
      new Date(today - DAY + 60_000),
      new Date(today - 60_000),
      new Date(today + 1000),
      new Date(today - 9 * DAY),
    ]);
    const theirs = await hubWithEvents(other.id, other.workspaceId, "Codex", [
      new Date(today + 1000),
      new Date(today + 2000),
    ]);

    const graph = await mapGraph(
      { userId: owner.id, workspaceId: owner.workspaceId },
      now
    );
    expect(graph.activity[mine.id]).toEqual([0, 0, 0, 0, 0, 2, 1]);
    expect(graph.activity[theirs.id]).toBeUndefined();

    const otherGraph = await mapGraph(
      { userId: other.id, workspaceId: other.workspaceId },
      now
    );
    expect(otherGraph.activity[theirs.id]).toEqual([0, 0, 0, 0, 0, 0, 2]);
    expect(otherGraph.activity[mine.id]).toBeUndefined();

    // The same through the owner's overview.
    await enableAgentHub(owner.id);
    await signInAs(page, owner);
    const res = await page.request.get("/api/agent-hub/overview?graph=1");
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as {
      graph: { activity: Record<string, number[]> } | null;
    };
    expect(body.graph?.activity[mine.id]).toEqual([0, 0, 0, 0, 0, 2, 1]);
    expect(body.graph?.activity[theirs.id]).toBeUndefined();
  });
});
