import { newDate } from "@/lib/date-utils";
import {
  type HubLimitKind,
  canAddToHub,
  hubHistoryDays,
} from "@/lib/entitlements";

import { HubError } from "./errors";

/**
 * Plan limits of the agent hub (owner decision 2026-11-03). Enforced in the
 * service layer, so the MCP tools and the REST routes refuse alike. Only new
 * creates are blocked: data above a limit stays and stays readable.
 */

const NOUN: Record<HubLimitKind, string> = {
  agents: "agents",
  items: "open hub items",
  notes: "memory notes",
};

const UPGRADE: Record<HubLimitKind, string> = {
  agents: "Upgrade to Pro for unlimited agents.",
  items: "Upgrade to Pro for unlimited hub items.",
  notes: "Upgrade to Pro for unlimited memory notes.",
};

/** Throws PLAN_LIMIT when `adding` more of `kind` does not fit the plan. */
export async function assertHubLimit(
  userId: string,
  kind: HubLimitKind,
  adding = 1
) {
  const status = await canAddToHub(userId, kind, adding);
  if (status.allowed || status.limit === null) return;
  throw new HubError(
    "PLAN_LIMIT",
    `The Free plan allows ${status.limit} ${NOUN[kind]} and you are at ${status.used}. ${UPGRADE[kind]}`,
    {
      limit: status.limit,
      used: status.used,
      resource: kind,
      plan: status.plan,
      upgradeRequired: status.upgradeRequired,
    }
  );
}

/** The earliest moment of hub history this person can see. */
export async function historySince(userId: string): Promise<Date> {
  const days = await hubHistoryDays(userId);
  return newDate(newDate().getTime() - days * 24 * 60 * 60 * 1000);
}
