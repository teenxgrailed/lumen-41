"use client";

import { useState } from "react";

import { useYesterdayNote } from "@/lib/needt3/hooks/daily-note";
import { useMorningBrief } from "@/lib/needt3/hooks/morning-brief";

import { type BriefFacts, inBriefWindow, shouldAskBrief } from "../brief";
import { dayFlag, setDayFlag } from "../nudge";
import { briefLines } from "./model";

const NS = "brief.note";

/**
 * Everything the brief piece needs, for both faces. It is in the morning only:
 * before 11:00 and before the first task of the day is done, whichever comes
 * first. A paid plan gets the agent's lines (written once a day, when AI can
 * answer) and the note End day left the evening before; a Free plan gets the
 * upsell in the same place; an unknown plan gets nothing. Dismissing hides it
 * until tomorrow.
 */
export function useHaBrief(o: {
  today: string;
  nowHour: number;
  doneToday: number;
  /** true paid, false Free, null not known yet. */
  pro: boolean | null;
  aiAvailable: boolean | undefined;
  facts: BriefFacts;
}) {
  const morning = inBriefWindow(o.nowHour, o.doneToday);
  const [, bump] = useState(0);
  const brief = useMorningBrief({
    day: o.today,
    show: o.pro === true && morning,
    ask: shouldAskBrief({
      pro: o.pro,
      morning,
      aiAvailable: o.aiAvailable,
      facts: o.facts,
    }),
    facts: o.facts,
  });
  const yesterday = useYesterdayNote(o.today, o.pro === true && morning);
  const noteOff = dayFlag(NS, o.today);
  const note = !noteOff && morning ? (yesterday.data ?? "") : "";
  return {
    /** Free, in the morning: the upsell stands in for the brief. */
    locked: o.pro === false && morning,
    lines: brief.brief ? briefLines(brief.brief.text) : [],
    note,
    dismiss: () => {
      brief.dismiss();
      setDayFlag(NS, o.today);
      bump((n) => n + 1);
    },
  };
}
