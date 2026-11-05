"use client";

import type { CSSProperties } from "react";

import { useInfiniteQuery } from "@tanstack/react-query";

import {
  formatDateToLocal,
  formatShortDate,
  newDate,
  newDateFromYMD,
  startOfDay,
  toLocalDateKey,
} from "@/lib/date-utils";
import { fetchJson } from "@/lib/needt3/hooks/core";

import { AgBtn, AgEmpty, listKeys, useAgentHue } from "./AgParts";

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

export const ACTIVITY_KEY = ["agent-hub", "activity"] as const;

function who(event: ActivityEvent) {
  if (event.actor.kind === "agent") return event.actor.name ?? "An agent";
  return event.actor.kind === "owner" ? "You" : "Needt";
}

/** "Today", "Yesterday", or "5 Nov" for the day headers. */
function dayLabel(key: string, now: Date) {
  if (key === toLocalDateKey(now)) return "Today";
  const yesterday = newDate(now.getTime());
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === toLocalDateKey(yesterday)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  return formatShortDate(newDateFromYMD(y, m - 1, d), y !== now.getFullYear());
}

/**
 * The Activity tab: what happened across all agent items, newest first, 50 a
 * page, in one panel per day. The agent filter sits on the screen's sticky bar
 * (`agent`). History is 7 days on Free and 90 on Pro. Event messages come from
 * agents, so they render as plain text.
 */
export function ActivityTab({
  agent,
  onOpenItem,
  week,
}: {
  agent: string;
  onOpenItem?: (id: string) => void;
  /**
   * The last seven days from the server (`?graph=1`), oldest first: the
   * whole week, not only the events loaded on this page.
   */
  week?: { days: number[]; byAgent: { id: string; name: string; n: number }[] };
}) {
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
  const hue = useAgentHue();
  const events = feed.data?.pages.flatMap((page) => page.events) ?? [];
  const days = feed.data?.pages[0]?.windowDays;
  const now = newDate();
  const groups: { key: string; events: ActivityEvent[] }[] = [];
  for (const event of events) {
    const key = toLocalDateKey(newDate(event.at));
    const last = groups[groups.length - 1];
    if (last?.key === key) last.events.push(event);
    else groups.push({ key, events: [event] });
  }

  if (feed.isLoading) {
    return (
      <div className="ag-state" data-ag-activity="" aria-busy="true">
        Loading activity
      </div>
    );
  }
  if (feed.isError) {
    return (
      <div data-ag-activity="">
        <AgEmpty
          art="task"
          title="Could not load activity"
          line="Check the connection and try again."
          action={<AgBtn onClick={() => void feed.refetch()}>Try again</AgBtn>}
        />
      </div>
    );
  }
  // This week, from the events loaded: a bar per day, Monday first, and
  // a count per agent. Real numbers only; nothing is drawn for no events.
  const monday = startOfDay(newDate(now.getTime()));
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const perDay = Array.from({ length: 7 }, () => 0);
  const perAgent = new Map<string, number>();
  for (const event of events) {
    const at = newDate(event.at);
    const day = Math.floor(
      (startOfDay(at).getTime() - monday.getTime()) / 86_400_000
    );
    if (day < 0 || day > 6) continue;
    perDay[day]++;
    const name = who(event);
    perAgent.set(name, (perAgent.get(name) ?? 0) + 1);
  }
  const bars = week?.days ?? perDay;
  const legs: [string, string, number][] = week
    ? week.byAgent.map((a) => [a.id, a.name, a.n])
    : Array.from(perAgent.entries()).map(([name, n]) => [name, name, n]);
  const peak = Math.max(1, ...bars);
  const total = bars.reduce((a, b) => a + b, 0);

  return (
    <div className="ag-col" data-ag-activity="">
      <p className="ag-sky-hint">
        {days ? `The last ${days} days, newest first.` : "Newest first."}
      </p>
      <div className="ag-act">
        <div className="ag-glass ag-feed">
          {groups.length ? (
            groups.map((group) => (
              <section key={group.key} data-ag-day="">
                <h3 className="ag-day">{dayLabel(group.key, now)}</h3>
                <ol className="ag-evs" onKeyDown={listKeys}>
                  {group.events.map((event) => (
                    <li
                      key={event.id}
                      className="ag-ev"
                      data-ag-event={event.kind}
                      style={
                        {
                          "--c": hue(event.actor.id ?? event.actor.name),
                        } as CSSProperties
                      }
                    >
                      <span className="ag-ev-t">
                        {formatDateToLocal(newDate(event.at)).slice(11, 16)}
                      </span>
                      <span className="ag-ev-node" aria-hidden="true" />
                      <span className="ag-ev-x">
                        <span>
                          <b>{who(event)}</b>
                          {` ${VERB[event.kind]} ${event.item.title}`}
                        </span>
                        {event.message ? <span>{event.message}</span> : null}
                      </span>
                      {/* //todo: Undo where the action can be reversed; the
                          hub has no undo route for events yet. */}
                      {onOpenItem ? (
                        <button
                          type="button"
                          className="ag-undo ag-main"
                          onClick={() => onOpenItem(event.item.id)}
                        >
                          Open
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </section>
            ))
          ) : (
            <div className="ag-panel-empty" data-ag-empty="">
              {agent
                ? "This agent has not done anything in this window."
                : "No activity yet. Claims, updates and finished work show up here."}
            </div>
          )}
          {feed.hasNextPage ? (
            <div className="ag-footer">
              <AgBtn
                disabled={feed.isFetchingNextPage}
                onClick={() => void feed.fetchNextPage()}
              >
                Show more
              </AgBtn>
            </div>
          ) : null}
        </div>
        <aside className="ag-glass ag-side" aria-label="This week">
          <h4>This week</h4>
          <div
            className="ag-bars"
            role="img"
            aria-label={`${total} events in the last seven days`}
          >
            {bars.map((n, i) => (
              <i
                key={i}
                style={{ height: `${n ? Math.max(6, (n / peak) * 100) : 2}%` }}
              />
            ))}
          </div>
          <div className="ag-bars-axis">
            <span>{week ? "7 days ago" : "Mon"}</span>
            <span>{week ? "Today" : "Sun"}</span>
          </div>
          <h4>By agent</h4>
          {legs.length ? (
            <ul className="ag-legs">
              {[...legs]
                .sort((a, b) => b[2] - a[2])
                .map(([id, name, n]) => (
                  <li key={id} className="ag-leg-row">
                    <span
                      className="ag-dotc"
                      style={{ background: hue(id) }}
                      aria-hidden
                    />
                    {name}
                    <span className="ag-leg-n">{n}</span>
                  </li>
                ))}
            </ul>
          ) : (
            <span className="ag-side-none">Nothing yet this week.</span>
          )}
        </aside>
      </div>
    </div>
  );
}
