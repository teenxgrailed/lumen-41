"use client";

import { Fragment, type ReactNode, useState } from "react";

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

import type { IdeaSlots } from "../../idea-cards/useIdeaSlots";
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
 * Overdue work, when the plan hides it behind "All tasks": the two actions
 * that clear it in one tap. Spread gives each task the next day with room this
 * week; Move to today puts them all on today. The one that suits the day leads
 * in full ink, the other in ladder grey; neither is a fill.
 */
function PlanLate({
  count,
  spreadFirst,
  canSpread,
  busy,
  onSpread,
  onMove,
}: {
  count: number;
  spreadFirst: boolean;
  canSpread: boolean;
  busy: boolean;
  onSpread: () => void;
  onMove: () => void;
}) {
  return (
    <div className="dp-late" data-day-late="">
      <span className="dp-late-n">{`${count} overdue`}</span>
      <span className="dp-late-acts">
        {canSpread ? (
          <button
            type="button"
            className="dp-late-btn"
            data-lead={spreadFirst ? "1" : "0"}
            data-day-spread=""
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={onSpread}
          >
            Spread
          </button>
        ) : null}
        <button
          type="button"
          className="dp-late-btn"
          data-lead={spreadFirst ? "0" : "1"}
          data-day-move-today=""
          onClick={onMove}
        >
          Move to today
        </button>
      </span>
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
  late,
  ideas,
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
  /** Overdue actions; left out when nothing is overdue. */
  late?: {
    count: number;
    spreadFirst: boolean;
    canSpread: boolean;
    busy: boolean;
    onSpread: () => void;
    onMove: () => void;
  } | null;
  /** Idea cards, each after the visible row the server asked for. */
  ideas?: IdeaSlots;
}) {
  const [decideFolded, setDecideFolded] = useState(true);
  const { main, rest, needsDecision } = planSections(snapshot);
  const mainTasks = main.flatMap((i) => {
    const t = byId.get(i.taskId);
    return t ? [t] : [];
  });
  // the rest, by part of the day: Anytime, Morning, Day, Evening
  const restTasks = rest.flatMap((i) => {
    const t = byId.get(i.taskId);
    return t ? [t] : [];
  });
  // Every visible row counts, main first, then the parts in the order drawn;
  // an idea card sits right after the row its `after` names.
  const total = mainTasks.length + restTasks.length;
  let seen = 0;
  const plain = (t: V3Task, size: "big" | "compact") =>
    row(t, { size, icon: <TaskGlyph title={t.title} icon={t.icon} /> });
  const one = (t: V3Task, size: "big" | "compact") => {
    seen += 1;
    return (
      <Fragment key={t.id}>
        {plain(t, size)}
        {ideas?.after(seen, total)}
      </Fragment>
    );
  };
  const parts = groupByDayPart(restTasks, (t) => hourAt(t));
  return (
    <div className="v2p-day dp-list" data-day-plan="">
      {mainTasks.length ? (
        <div className="dp-group dp-main" data-day-main="">
          {mainTasks.map((t) => one(t, "big"))}
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
                  plain(task, "compact")
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
      {late && !allOpen ? <PlanLate {...late} /> : null}
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
