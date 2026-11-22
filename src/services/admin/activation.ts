import { ACTIVATION_EVENTS } from "@/lib/activation-events";
import { addCalendarDays, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { NOT_QA_USER } from "./internal-accounts";

export interface ActivationCount {
  name: (typeof ACTIVATION_EVENTS)[number];
  /** Distinct non-founder users who did it in the last 7 days. */
  users7Days: number;
  users14Days: number;
}

export interface AdminActivation {
  events: ActivationCount[];
  generatedAt: string;
}

/**
 * Distinct users per activation event over 7 and 14 days. Founder (admin) and
 * sandbox and QA bot accounts are left out, so the figure is external users only. Counts
 * only: nothing about who they are leaves the database.
 */
export async function getAdminActivation(
  now: Date = newDate()
): Promise<AdminActivation> {
  const since7 = addCalendarDays(now, -7);
  const since14 = addCalendarDays(now, -14);
  const rows = await prisma.activationEvent.groupBy({
    by: ["name", "userId"],
    where: {
      createdAt: { gte: since14 },
      user: { role: { not: "admin" }, sandboxKind: null, ...NOT_QA_USER },
    },
    _max: { createdAt: true },
  });
  const events = ACTIVATION_EVENTS.map((name) => {
    const mine = rows.filter((row) => row.name === name);
    return {
      name,
      users14Days: mine.length,
      /* A user's latest event inside 7 days means they did it in 7 days. */
      users7Days: mine.filter(
        (row) => row._max.createdAt && row._max.createdAt >= since7
      ).length,
    };
  });
  return { events, generatedAt: now.toISOString() };
}
