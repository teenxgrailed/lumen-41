"use client";

import { useState } from "react";

import type { V3Task } from "@/lib/needt3/map";

import { isMorning } from "./brief";
import { dayFlag, setDayFlag } from "./nudge";
import { suggestHighlight } from "./suggest";

const NS = "highlight.suggest";

/**
 * Morning only, only while no highlight is set and the highlight is known
 * (so it never flashes before the read): the best task due today, with
 * "Another" cycling to the next. Hidden when nothing is due today.
 */
export function useHighlightSuggest(o: {
  tasks: readonly V3Task[];
  today: string;
  nowHour: number;
  /** The highlight query has answered. */
  known: boolean;
  hasHighlight: boolean;
  accept: (taskId: string) => void;
}) {
  const [n, setN] = useState(0);
  const [, bump] = useState(0);
  const eligible =
    o.known && !o.hasHighlight && isMorning(o.nowHour) && !dayFlag(NS, o.today);
  const pick = eligible ? suggestHighlight(o.tasks, o.today, n) : null;
  return {
    pick: pick?.task ?? null,
    canCycle: (pick?.of ?? 0) > 1,
    accept: () => pick && o.accept(pick.task.id),
    another: () => setN((x) => x + 1),
    dismiss: () => {
      setDayFlag(NS, o.today);
      bump((x) => x + 1);
    },
  };
}
