"use client";

import { useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

import { fetchJson } from "./core";

/**
 * What the navigation knows about the agent hub (`GET /api/agent-hub/badge`):
 * whether the Agents item exists for this person at all, and how many alerts
 * (an escalation, or no agent for an item) they have not opened. An account
 * without the `agent_hub` flag gets `enabled: false` and never sees the item.
 */
export interface AgentHubNav {
  enabled: boolean;
  unread: number;
}

const OFF: AgentHubNav = { enabled: false, unread: 0 };

export function useAgentHubNav(): AgentHubNav {
  const query = useQuery({
    queryKey: qk.agentHubNav(),
    queryFn: () => fetchJson<AgentHubNav>("/api/agent-hub/badge"),
    staleTime: 20_000,
    refetchInterval: 60_000,
    // A failed read hides the item rather than guessing it into view.
    retry: false,
  });
  return query.data ?? OFF;
}
