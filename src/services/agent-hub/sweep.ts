import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { pushOwnerAlert } from "./alerts";
import { NO_AGENT_ALERT_AFTER_MS } from "./constants";
import type { WorkspaceKey } from "./context";
import { noteExpiredLeases, skillsCover } from "./items";

/**
 * An open "any capable" item that no registered, enabled agent can do for 24
 * hours raises exactly one owner alert (an unread badge on the Agents item and
 * a push to `/agents?item=<id>`). It creates no Needt task. The check is lazy
 * (it runs on hub reads) and idempotent: the conditional update below can
 * succeed for one reader only, so a second reader raises no second alert.
 */
export async function raiseNoCapableAgent(key: WorkspaceKey) {
  const cutoff = newDate(newDate().getTime() - NO_AGENT_ALERT_AFTER_MS);
  const stale = await prisma.hubItem.findMany({
    where: {
      userId: key.userId,
      workspaceId: key.workspaceId,
      status: "open",
      assigneeAgentId: null,
      noAgentAlertedAt: null,
      // Rows from before alerts replaced tasks already got their task.
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
    const now = newDate();
    const made = await prisma.$transaction(async (tx) => {
      const claimed = await tx.hubItem.updateMany({
        where: {
          id: item.id,
          noAgentAlertedAt: null,
          status: "open",
          assigneeAgentId: null,
        },
        data: {
          noAgentAlertedAt: now,
          ownerUnread: true,
          ownerAlertedAt: now,
          version: { increment: 1 },
        },
      });
      if (claimed.count === 0) return false;
      await tx.hubItemEvent.create({
        data: {
          itemId: item.id,
          at: now,
          actorKind: "system",
          type: "no_capable_agent",
          fromStatus: "open",
          toStatus: "open",
          message:
            "No registered agent has the required skills after 24 hours; the owner was alerted.",
          data: { requiredSkills: item.requiredSkills },
        },
      });
      return true;
    });
    if (made) {
      raised += 1;
      await pushOwnerAlert(key.userId, {
        title: "No agent for a task",
        body: item.title,
        itemId: item.id,
      });
    }
  }
  return raised;
}

/** Everything lazy that a hub read should settle first. */
export async function sweepHub(key: WorkspaceKey) {
  await noteExpiredLeases(key);
  await raiseNoCapableAgent(key);
}
