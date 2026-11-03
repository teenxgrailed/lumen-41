"use client";

import { useState } from "react";

import { useInfiniteQuery } from "@tanstack/react-query";

import { formatDateToLocal, newDate } from "@/lib/date-utils";
import { fetchJson } from "@/lib/needt3/hooks/core";

import { AgBtn, AgEmpty, AgRow, AgSection, type AgTone } from "./AgParts";

export interface ActivityEvent {
  id: string;
  at: string;
  kind:
    | "created"
    | "claimed"
    | "updated"
    | "completed"
    | "escalated"
    | "answered";
  type: string;
  actor: { kind: string; id?: string | null; name?: string };
  item: { id: string; title: string };
  message: string;
}

interface ActivityPage {
  windowDays: number;
  events: ActivityEvent[];
  nextCursor: string | null;
}

const VERB: Record<ActivityEvent["kind"], string> = {
  created: "created",
  claimed: "claimed",
  updated: "updated",
  completed: "finished",
  escalated: "asked you about",
  answered: "answered",
};

const TONE: Record<ActivityEvent["kind"], AgTone> = {
  created: "muted",
  claimed: "info",
  updated: "none",
  completed: "success",
  escalated: "accent",
  answered: "success",
};

export const ACTIVITY_KEY = ["agent-hub", "activity"] as const;

function who(event: ActivityEvent) {
  if (event.actor.kind === "agent") return event.actor.name ?? "An agent";
  return event.actor.kind === "owner" ? "You" : "Needt";
}

/**
 * The Activity tab: what happened across all agent items, newest first, 50 a
 * page, filtered by agent. History is 7 days on Free and 90 on Pro. Event
 * messages come from agents, so they render as plain text.
 */
export function ActivityTab({
  agents,
  onOpenItem,
}: {
  agents: { id: string; name: string }[];
  onOpenItem?: (id: string) => void;
}) {
  const [agent, setAgent] = useState("");
  const feed = useInfiniteQuery({
    queryKey: [...ACTIVITY_KEY, agent],
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams();
      if (agent) q.set("agent", agent);
      if (pageParam) q.set("cursor", pageParam);
      return fetchJson<ActivityPage>(`/api/agent-hub/activity?${q}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: 30_000,
  });
  const events = feed.data?.pages.flatMap((page) => page.events) ?? [];
  const days = feed.data?.pages[0]?.windowDays;

  return (
    <div data-ag-activity="">
      <AgSection
        title="Activity"
        hint={days ? `The last ${days} days, newest first.` : "Newest first."}
      >
        <div className="ag-form" data-ag-activity-filter="">
          <AgBtn pressed={!agent} onClick={() => setAgent("")}>
            All agents
          </AgBtn>
          {agents.map((a) => (
            <AgBtn
              key={a.id}
              pressed={agent === a.id}
              onClick={() => setAgent(a.id)}
            >
              {a.name}
            </AgBtn>
          ))}
        </div>
        {events.length ? (
          events.map((event) => (
            <AgRow
              key={event.id}
              tone={TONE[event.kind]}
              title={`${who(event)} ${VERB[event.kind]} ${event.item.title}`}
              meta={[event.message, formatDateToLocal(newDate(event.at))]
                .filter(Boolean)
                .join(" · ")}
              actions={
                onOpenItem ? (
                  <AgBtn tone="text" onClick={() => onOpenItem(event.item.id)}>
                    Open
                  </AgBtn>
                ) : undefined
              }
            />
          ))
        ) : (
          <AgEmpty
            art="task"
            title="No activity yet"
            line="Claims, updates and finished work show up here."
          />
        )}
        {feed.hasNextPage ? (
          <AgBtn
            tone="text"
            disabled={feed.isFetchingNextPage}
            onClick={() => void feed.fetchNextPage()}
          >
            Show more
          </AgBtn>
        ) : null}
      </AgSection>
    </div>
  );
}
