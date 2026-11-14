import { sendUmamiEvent } from "@/lib/umami-server";

/**
 * Activation events for the Agents hub, sent through the same server-side
 * Umami helper as `purchase`. They are emitted from the service functions, so
 * the MCP and REST surfaces both count. Payloads hold ids, kinds and outcomes
 * only: never a title, a goal, a note, an answer or a user id.
 */
export type HubMetric =
  | { name: "agent_registered"; agentId: string; kind: string }
  | { name: "hub_item_created"; itemId: string; creator: "agent" | "owner" }
  | { name: "hub_item_completed"; itemId: string; outcome: "done" | "failed" }
  | { name: "escalation_answered"; itemId: string };

/** Fire and forget: a failed event never reaches the hub call. */
export function trackHub(metric: HubMetric): void {
  const { name, ...data } = metric;
  /* The app website, not the landing one: hub activity is product-internal
     and must not mix into the acquisition funnel. */
  void sendUmamiEvent(name, data, "app");
}
