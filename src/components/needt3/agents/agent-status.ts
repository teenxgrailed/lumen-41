import { newDate } from "@/lib/date-utils";

import { type AgentStatus, worstStatus } from "./map-scene";

/** A failure stays red for three days; older ones live in Tasks. */
export const FAILURE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

interface AgentLike {
  id: string;
  token?: { revoked: boolean } | null;
}
interface ItemLike {
  id: string;
  title: string;
  status: string;
  question?: string | null;
  updatedAt: string;
  assignee: { id?: string; name?: string } | "any" | null;
}

export interface AgentStatusInfo {
  status: AgentStatus;
  /** For the Map's hover: "Working · …", "Asked: …", "All good", … */
  line: string;
  /** For an alert: "connection expired" or "a task failed". */
  reason: string | null;
}

/** Failed items inside the window, newest state only. */
export function recentFailures<T extends ItemLike>(items: T[], now: number) {
  return items.filter(
    (i) =>
      i.status === "failed" &&
      newDate(i.updatedAt).getTime() >= now - FAILURE_WINDOW_MS
  );
}

/**
 * Each agent's status (owner, 05.11.26):
 * - red (alert): broken: a revoked token, or a task that failed lately;
 * - orange (waiting): a question or an approval waits on you in Chat;
 * - blue (working): an item in progress, or a reservation held;
 * - green (ok): all is well.
 * The worst wins.
 */
export function agentStatuses(
  agents: AgentLike[],
  items: ItemLike[],
  working: Set<string>,
  nowOf: Map<string, string>,
  now: number
) {
  const failed = new Set(recentFailures(items, now).map((i) => i.id));
  const map = new Map<string, AgentStatusInfo>();
  for (const a of agents) {
    const own = items.filter(
      (i) => i.assignee && i.assignee !== "any" && i.assignee.id === a.id
    );
    const list: AgentStatus[] = [];
    let reason: string | null = null;
    let asked: string | null = null;
    if (a.token?.revoked) {
      list.push("alert");
      reason = "connection expired";
    }
    for (const i of own) {
      if (failed.has(i.id)) {
        list.push("alert");
        reason ??= "a task failed";
      } else if (i.status === "needs_owner") {
        list.push("waiting");
        asked ??= i.question ?? i.title;
      }
    }
    if (working.has(a.id)) list.push("working");
    const status = worstStatus(list);
    const line =
      status === "alert"
        ? reason === "connection expired"
          ? "Connection expired — reconnect"
          : `Needs you · ${reason}`
        : status === "waiting"
          ? `Asked: ${asked}`
          : status === "working"
            ? `Working · ${nowOf.get(a.id) ?? "on a task"}`
            : "All good";
    map.set(a.id, { status, line, reason });
  }
  return map;
}
