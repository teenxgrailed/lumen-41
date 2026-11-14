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

/**
 * Fire and forget: a failed event never reaches the hub call. Hub events go to
 * their own Umami website (`UMAMI_HUB_WEBSITE_ID`) so they stay out of the
 * needt.app funnel; without that id they are not sent at all.
 */
export function trackHub(metric: HubMetric): void {
  const { name, ...data } = metric;
  void sendUmamiEvent(name, data, {
    website: process.env.UMAMI_HUB_WEBSITE_ID,
  });
}
