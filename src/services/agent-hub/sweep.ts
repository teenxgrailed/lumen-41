import { randomUUID } from "crypto";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEventSafe } from "@/lib/realtime/publish";

import { NO_AGENT_TASK_AFTER_MS } from "./constants";
import type { WorkspaceKey } from "./context";
import { createOwnerTask, noteExpiredLeases, skillsCover } from "./items";

/**
 * An open "any capable" item that no registered, enabled agent can do for 24
 * hours creates exactly one owner task, stored on the item. The check is lazy
 * (it runs on hub reads) and idempotent: the conditional update below can
 * succeed for one reader only, so a second reader creates no second task.
 */
export async function raiseNoCapableAgent(key: WorkspaceKey) {
  const cutoff = newDate(newDate().getTime() - NO_AGENT_TASK_AFTER_MS);
  const stale = await prisma.hubItem.findMany({
    where: {
      userId: key.userId,
      workspaceId: key.workspaceId,
      status: "open",
      assigneeAgentId: null,
      noAgentTaskId: null,
      createdAt: { lt: cutoff },
    },
    take: 50,
  });
  if (!stale.length) return 0;
  const agents = await prisma.hubAgent.findMany({
    where: {
      userId: key.userId,
      workspaceId: key.workspaceId,
      disabledAt: null,
    },
    select: { skills: true },
  });
  let raised = 0;
  for (const item of stale) {
    if (
      agents.some((agent) => skillsCover(agent.skills, item.requiredSkills))
    ) {
      continue;
    }
    const taskId = randomUUID();
    const now = newDate();
    const made = await prisma.$transaction(async (tx) => {
      const claimed = await tx.hubItem.updateMany({
        where: {
          id: item.id,
          noAgentTaskId: null,
          status: "open",
          assigneeAgentId: null,
        },
        data: { noAgentTaskId: taskId, version: { increment: 1 } },
      });
      if (claimed.count === 0) return false;
      await createOwnerTask(tx, {
        id: taskId,
        userId: key.userId,
        workspaceId: key.workspaceId,
        title: `No agent for: ${item.title}`,
        description: [
          `No connected agent has the skills this item needs (${item.requiredSkills.join(", ")}) after 24 hours.`,
          "Connect an agent that can do it, change the skills, or cancel the item on the Agents screen:",
          `/agents?item=${item.id}`,
        ].join("\n"),
      });
      await tx.hubItemEvent.create({
        data: {
          itemId: item.id,
          at: now,
          actorKind: "system",
          type: "no_capable_agent",
          fromStatus: "open",
          toStatus: "open",
          message:
            "No registered agent has the required skills after 24 hours; an owner task was created.",
          data: { taskId, requiredSkills: item.requiredSkills },
        },
      });
      return true;
    });
    if (made) raised += 1;
  }
  if (raised) await publishRealtimeEventSafe(key.userId, "tasks-updated");
  return raised;
}

/** Everything lazy that a hub read should settle first. */
export async function sweepHub(key: WorkspaceKey) {
  await noteExpiredLeases(key);
  await raiseNoCapableAgent(key);
}
