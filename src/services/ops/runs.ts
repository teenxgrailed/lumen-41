import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import type { OpActor } from "./types";

export type AgentRunSource = "chat" | "background" | "mcp";

/** Opens a run so the actions it applies can be undone together. */
export async function startAgentRun(input: {
  userId: string;
  workspaceId: string;
  actor: OpActor;
  source: AgentRunSource;
}) {
  return prisma.agentRun.create({
    data: { ...input, status: "running" },
    select: { id: true },
  });
}

export async function finishAgentRun(
  runId: string,
  status: "finished" | "failed" = "finished"
) {
  return prisma.agentRun.update({
    where: { id: runId },
    data: { status, finishedAt: newDate() },
    select: { id: true },
  });
}
