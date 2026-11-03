/**
 * The Agents item in the navigation (desktop sidebar and the phone menu). Pure.
 *
 * It exists only while the agent hub is on for the person (`enabled`, from
 * `GET /api/agent-hub/badge`, which reads the `agent_hub` flag). It is not one
 * of the sidebar's `PLACES`: like Connections it has no tile to customise, so
 * a person without the flag has nothing to hide and nothing in Customize.
 * The badge counts alerts the owner has not opened (an agent asked something,
 * or no agent can do an item).
 */
import type { AgentHubNav } from "@/lib/needt3/hooks/agent-hub";

export const AGENTS_HREF = "/agents";

export interface AgentsNavItem {
  href: string;
  label: string;
  /** Unread alerts; 0 shows no badge. */
  unread: number;
  /** The badge as printed ("9+" past nine), or null. */
  badge: string | null;
  /** Spoken for the badge and the row's tooltip. */
  title: string;
}

/** The item to draw, or null when the hub is off for this person. */
export function agentsNavItem(
  nav: Pick<AgentHubNav, "enabled" | "unread">
): AgentsNavItem | null {
  if (!nav.enabled) return null;
  const unread = Math.max(0, Math.floor(nav.unread));
  return {
    href: AGENTS_HREF,
    label: "Agents",
    unread,
    badge: unread ? (unread > 9 ? "9+" : String(unread)) : null,
    title: unread
      ? `${unread} ${unread === 1 ? "agent needs" : "agents need"} you`
      : "Agents",
  };
}

/** Whether a pathname is on the Agents screen. */
export function isAgentsPath(pathname: string) {
  return pathname === AGENTS_HREF || pathname.startsWith(`${AGENTS_HREF}/`);
}
