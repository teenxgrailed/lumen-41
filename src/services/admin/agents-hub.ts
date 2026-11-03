import { ASSISTANT_CONNECTION_KEY } from "@/services/agent-hub/constants";

import { addCalendarDays, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

export interface AdminAgentsHub {
  /** Accounts that registered at least one agent of their own in the window. */
  accountsWithAgent7Days: number;
  accountsWithAgent30Days: number;
  /** Items an agent finished as done, counted by completion event. */
  itemsCompletedByAgents7Days: number;
  /** needs_owner items the owner answered. */
  escalationsAnswered7Days: number;
  generatedAt: string;
}

/**
 * Activation counts for the Agents hub card on the admin Overview. Counts only,
 * read from HubAgent and HubItemEvent; no titles, goals or answers leave the
 * database. The built-in Needt assistant is not an agent the person connected,
 * so it is left out of the account counts.
 */
export async function getAdminAgentsHub(
  now: Date = newDate()
): Promise<AdminAgentsHub> {
  const since7 = addCalendarDays(now, -7);
  const since30 = addCalendarDays(now, -30);
  const accounts = async (since: Date) =>
    (
      await prisma.hubAgent.groupBy({
        by: ["userId"],
        where: {
          createdAt: { gte: since },
          connectionKey: { not: ASSISTANT_CONNECTION_KEY },
        },
      })
    ).length;
  const [
    accountsWithAgent7Days,
    accountsWithAgent30Days,
    itemsCompletedByAgents7Days,
    escalationsAnswered7Days,
  ] = await Promise.all([
    accounts(since7),
    accounts(since30),
    prisma.hubItemEvent.count({
      where: { type: "completed", actorKind: "agent", at: { gte: since7 } },
    }),
    prisma.hubItemEvent.count({
      where: { type: "owner_answer", at: { gte: since7 } },
    }),
  ]);
  return {
    accountsWithAgent7Days,
    accountsWithAgent30Days,
    itemsCompletedByAgents7Days,
    escalationsAnswered7Days,
    generatedAt: now.toISOString(),
  };
}
