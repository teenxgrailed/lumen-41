"use client";

import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { sendJson } from "@/lib/needt3/hooks/core";
import type { V3Task } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";
import { type WeekFocusItem, focusTasks } from "@/lib/needt3/week-focus";

import { isMorning } from "./brief";
import { dayFlag, setDayFlag } from "./nudge";
import {
  type Suggestion,
  agentSuggestions,
  aiCandidates,
  ruleSuggestions,
  suggestionPool,
} from "./suggest";

const NS = "highlight.suggest";

interface Pick {
  taskId: string;
  reason: string;
}

type Outcome =
  | { status: "ready"; suggestions: Pick[] }
  | { status: "unavailable" | "upgrade"; suggestions: [] };

const storeKey = (day: string) => `needt.highlight.picks.${day}`;

/** The day's agent picks, kept so a reload does not spend another AI action. */
function readPicks(day: string): Pick[] | null {
  try {
    const raw = window.localStorage.getItem(storeKey(day));
    const data: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(data) && data.length ? (data as Pick[]) : null;
  } catch {
    return null;
  }
}

function writePicks(day: string, picks: Pick[]) {
  try {
    window.localStorage.setItem(storeKey(day), JSON.stringify(picks));
  } catch {
    // it may ask again after a reload; that is all
  }
}

/**
 * Morning only, only while no highlight is set and the highlight is known
 * (so it never flashes before the read): two or three suggestions, each with
 * a one-line reason, "Another" cycling through them. The week's focuses come
 * first. With the agent (`ai`: a paid plan and an AI that can answer) it asks
 * once a day for the order and the reasons; without it the rules answer. Hidden
 * when nothing is due today and no focus matches.
 */
export function useHighlightSuggest(o: {
  tasks: readonly V3Task[];
  today: string;
  nowHour: number;
  /** The highlight query has answered. */
  known: boolean;
  hasHighlight: boolean;
  accept: (taskId: string) => void;
  /** The week's focuses from the Sunday review. */
  weekFocus?: readonly WeekFocusItem[];
  /** The agent may be asked (Pro and an AI that can answer). */
  ai?: boolean;
}) {
  const [n, setN] = useState(0);
  const [, bump] = useState(0);
  const eligible =
    o.known && !o.hasHighlight && isMorning(o.nowHour) && !dayFlag(NS, o.today);

  const pool = useMemo(
    () =>
      eligible
        ? suggestionPool(
            o.tasks,
            o.today,
            focusTasks(o.weekFocus ?? [], o.tasks)
          )
        : [],
    [eligible, o.tasks, o.today, o.weekFocus]
  );

  const asked = useQuery({
    queryKey: qk.highlightSuggestions(o.today),
    queryFn: async () => {
      const kept = readPicks(o.today);
      if (kept) return kept;
      const out = await sendJson<Outcome>(
        "/api/ai/highlight-suggestions",
        "POST",
        { date: o.today, candidates: aiCandidates(pool) }
      );
      if (out.status !== "ready") return [];
      writePicks(o.today, out.suggestions);
      return out.suggestions;
    },
    // one agent question per day; with a single candidate there is nothing to choose
    enabled: eligible && o.ai === true && pool.length > 1,
    staleTime: Infinity,
    retry: false,
  });

  const list: Suggestion[] = useMemo(
    () =>
      pool.length
        ? asked.data?.length
          ? agentSuggestions(pool, asked.data, o.today)
          : ruleSuggestions(pool, o.today)
        : [],
    [pool, asked.data, o.today]
  );
  const i = list.length ? n % list.length : 0;
  const cur = list[i];
  return {
    pick: cur?.task ?? null,
    reason: cur?.reason ?? "",
    index: i,
    count: list.length,
    canCycle: list.length > 1,
    accept: () => cur && o.accept(cur.task.id),
    another: () => setN((x) => x + 1),
    dismiss: () => {
      setDayFlag(NS, o.today);
      bump((x) => x + 1);
    },
  };
}
