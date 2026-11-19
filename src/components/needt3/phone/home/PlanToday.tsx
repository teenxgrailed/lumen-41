"use client";

import { type ReactNode, useState } from "react";

import {
  LuCalendar,
  LuCheck,
  LuChevronDown,
  LuChevronRight,
  LuRepeat,
} from "react-icons/lu";

import {
  type DayPlanSnapshot,
  type PlanView,
  planSections,
} from "@/lib/needt3/day-plan";
import {
  DAY_PART_LABEL,
  type FactKind,
  greetingParts,
  greetingText,
  groupByDayPart,
  planStats,
} from "@/lib/needt3/day-plan-view";
import { at as hourAt } from "@/lib/needt3/derive";
import type { V3Task } from "@/lib/needt3/map";

import { TaskGlyph } from "./TaskGlyph";

const FACT_ICON: Record<FactKind, typeof LuCheck> = {
  meetings: LuCalendar,
  tasks: LuCheck,
  habits: LuRepeat,
};

/** The big short weekday, with the one small accent mark (a dot, never a fill). */
export function PlanWeekday({ weekday }: { weekday: string }) {
  return (
    <span className="dp-day" data-day-weekday="">
      {weekday}
      <i className="dp-dot" aria-hidden="true" />
    </span>
  );
}

/** The date and year at the right of the header, in ladder grey. */
export function PlanDate({ date, year }: { date: string; year: string }) {
  return (
    <span className="dp-date" data-day-date="">
      {date}
      <span>{year}</span>
    </span>
  );
}

/**
 * The greeting sentence and the stats line under the header. The sentence is
 * a template filled from data (no AI call): connective words in ladder grey,
 * the facts in full ink, each after its small icon. The line under it is the
 * limit used and the focus total.
 */
export function PlanHello({
  plan,
  hour,
  meetings,
  habits,
  freeAfter,
}: {
  plan: PlanView;
  hour: number;
  meetings: number;
  habits: number;
  freeAfter: string | null;
}) {
  const parts = greetingParts({
    hour,
    meetings,
    tasks: plan.taskCount,
    habits,
    freeAfter,
  });
  const stats = planStats(plan);
  return (
    <div className="dp-hello" data-day-hello="">
      <p className="dp-sentence" aria-label={greetingText(parts)}>
        {parts.map((p, i) => {
          if (p.kind === "text")
            return (
              <span key={i} className="dp-soft" aria-hidden="true">
                {p.text}
              </span>
            );
          const Icon = FACT_ICON[p.fact];
          return (
            <span key={i} className="dp-fact" aria-hidden="true">
              <Icon className="dp-fact-ic" size={18} strokeWidth={2.2} />
              {p.text}
            </span>
          );
        })}
      </p>
      <p className="dp-stats" data-day-plan-line="">
        <span>{`${stats.used} tasks`}</span>
        <i aria-hidden="true" />
        <span>{stats.focus}</span>
      </p>
    </div>
  );
}

/**
 * Today from the plan, on the same surface as the greeting above it, parted
 * from it by air and a hairline: the main tasks first as larger rows with an
 * icon, then the rest in compact rows, a folded "Needs a decision" group
 * outside the limit, and the way to the full list and to Someday. Rows are
 * the screen's own (`row`); this only arranges them.
 */
export function PlanToday({
  snapshot,
  byId,
  row,
  allCount,
  allOpen,
  onAll,
  onSomeday,
}: {
  snapshot: DayPlanSnapshot;
  byId: ReadonlyMap<string, V3Task>;
  row: (
    t: V3Task,
    o?: { icon?: ReactNode; size?: "big" | "compact" }
  ) => ReactNode;
  /** Open tasks outside the plan (overdue, Inbox): the full list. */
  allCount: number;
  allOpen: boolean;
  onAll: () => void;
  onSomeday: () => void;
}) {
  const [decideFolded, setDecideFolded] = useState(true);
  const { main, rest, needsDecision } = planSections(snapshot);
  const one = (t: V3Task, size: "big" | "compact") =>
    row(t, { size, icon: <TaskGlyph title={t.title} /> });
  const rows = (items: typeof main, size: "big" | "compact") =>
    items.flatMap((i) => {
      const t = byId.get(i.taskId);
      return t ? [one(t, size)] : [];
    });
  // the rest, by part of the day: Anytime, Morning, Day, Evening
  const restTasks = rest.flatMap((i) => {
    const t = byId.get(i.taskId);
    return t ? [t] : [];
  });
  const parts = groupByDayPart(restTasks, (t) => hourAt(t));
  return (
    <div className="v2p-day dp-list" data-day-plan="">
      {main.length ? (
        <div className="dp-group dp-main" data-day-main="">
          {rows(main, "big")}
        </div>
      ) : null}
      {parts.length ? (
        <div className="dp-group dp-rest" data-day-rest="">
          {parts.map((g) => (
            <section key={g.part} className="dp-part" data-day-part={g.part}>
              <p className="dp-label">
                {DAY_PART_LABEL[g.part]}
                <span>{g.items.length}</span>
              </p>
              {g.items.map((t) => one(t, "compact"))}
            </section>
          ))}
        </div>
      ) : null}
      {needsDecision.length ? (
        <div className="dp-group dp-decide" data-day-decide="">
          <button
            type="button"
            className="dp-fold"
            aria-expanded={!decideFolded}
            onClick={() => setDecideFolded((f) => !f)}
          >
            <span>Needs a decision</span>
            <span className="dp-fold-n">{needsDecision.length}</span>
            <LuChevronDown
              className="dp-fold-ch"
              size={16}
              data-open={decideFolded ? "0" : "1"}
              aria-hidden="true"
            />
          </button>
          {decideFolded ? null : (
            <div className="dp-rise">
              {needsDecision.map((t) => {
                const task = byId.get(t.id);
                return task ? (
                  one(task, "compact")
                ) : (
                  <div key={t.id} className="dp-orphan">
                    {t.title}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
      <nav className="dp-links" data-day-plan-links="" aria-label="More tasks">
        {allCount ? (
          <button type="button" className="dp-link" onClick={onAll}>
            <span>
              {allOpen ? "Hide the full list" : `All tasks · ${allCount}`}
            </span>
            <LuChevronRight size={16} aria-hidden="true" />
          </button>
        ) : null}
        <button type="button" className="dp-link" onClick={onSomeday}>
          <span>Someday</span>
          <LuChevronRight size={16} aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}
