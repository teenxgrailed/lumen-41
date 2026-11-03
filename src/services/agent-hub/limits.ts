import { newDate } from "@/lib/date-utils";
import {
  type HubLimitKind,
  canAddToHub,
  hubHistoryWindow,
} from "@/lib/entitlements";

import { ASSISTANT_CONNECTION_KEY } from "./constants";
import type { Actor } from "./context";
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

/**
 * assertHubLimit for a create made by `actor`. Needt's own assistant (Ask) is
 * never blocked: a full Free account must not break its hand-off.
 */
export async function assertHubLimitFor(
  userId: string,
  actor: Actor,
  kind: HubLimitKind,
  adding = 1
) {
  if (
    actor.kind === "agent" &&
    actor.agent.connectionKey === ASSISTANT_CONNECTION_KEY
  ) {
    return;
  }
  await assertHubLimit(userId, kind, adding);
}

/** What a person can see of the hub history, resolved once per request. */
export interface HistoryWindow {
  since: Date;
  /** Free: an open item still shows its single latest event past the window. */
  limited: boolean;
}

export async function historyWindow(userId: string): Promise<HistoryWindow> {
  const { days, limited } = await hubHistoryWindow(userId);
  return {
    since: newDate(newDate().getTime() - days * 24 * 60 * 60 * 1000),
    limited,
  };
}

/** The earliest moment of hub history this person can see. */
export async function historySince(userId: string): Promise<Date> {
  return (await historyWindow(userId)).since;
}
