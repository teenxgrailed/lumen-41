"use client";

/* Goals as cards (flag `habits_cards_v1`): the habit cards' language on the
   Goals screen. A goal card is its progress, its next step (the first open
   task linked to it, with a Schedule action), its deadline and its standing
   (at risk with the days left, or on track). A goal with nothing planned in
   the next 7 days offers "Plan a task". At-risk goals come first.
   Colour is a tint and a mark, never a fill: the hue is the first linked
   project's colour; red only marks a goal at risk. Presentational; the next
   steps, hues and what is planned come in as props. */
import { useState } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";

import { type GoalView, goalAreaLabel, goalProgressLabel } from "@/lib/goals";

import { spreadDay } from "../home/spread";
import { goalStanding, sortByRisk } from "./standing";

type Step = { id: string; title: string };

export interface GoalCardsProps {
  goals: readonly GoalView[];
  selectedId: string | null;
  /** The first open linked task per goal id; null = none open. */
  nextSteps: Readonly<Record<string, Step | null>>;
  /** Goal id → a colour (its project's), when it has one. */
  hues?: Readonly<Record<string, string>>;
  /** "YYYY-MM-DD" in the person's zone. */
  today: string;
  /** Next-step task id → the day it is scheduled on, null = not placed yet. */
  stepDays?: Readonly<Record<string, string | null>>;
  /** Goal id → has an open task scheduled in the next 7 days. Absent = unknown. */
  planned?: Readonly<Record<string, boolean>>;
  /** True while a schedule write is running. */
  busy?: boolean;
  onSelect: (id: string) => void;
  /** Place the next step (the Spread action, for one task). */
  onSchedule?: (taskId: string) => void;
  /** Nothing planned: open the goal, where its tasks are added. */
  onPlan?: (goalId: string) => void;
}

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function GoalCard({
  goal,
  step,
  stepKnown,
  stepDay,
  planned,
  busy,
  hue,
  today,
  selected,
  onSelect,
  onSchedule,
  onPlan,
}: {
  goal: GoalView;
  step: Step | null;
  /** False until the goal's tasks have been read. */
  stepKnown: boolean;
  /** The step's scheduled day; null = not placed. */
  stepDay: string | null;
  /** Something is scheduled in the next 7 days; undefined = not known yet. */
  planned: boolean | undefined;
  busy: boolean;
  hue: string | undefined;
  today: string;
  selected: boolean;
  onSelect: (id: string) => void;
  onSchedule?: (taskId: string) => void;
  onPlan?: (goalId: string) => void;
}) {
  const label = goalProgressLabel(goal.progress);
  const standing = goalStanding(goal, today);
  const open = goal.status === "active";
  const pct = goal.progress.percent ?? 0;
  const meta = [
    goalAreaLabel(goal.area),
    goal.status === "achieved"
      ? "Achieved"
      : goal.status === "dropped"
        ? "Dropped"
        : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // A button must not sit inside a button: the card is a div that acts as one,
  // and its own actions stop the click from also selecting the goal.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(goal.id);
    }
  };
  const own = (fn: () => void) => (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      className={`gl-card nx-press nx-focus${selected ? " is-on" : ""}`}
      style={hue ? ({ "--hue": hue } as CSSProperties) : undefined}
      data-gl-card={goal.id}
      aria-pressed={selected}
      onClick={() => onSelect(goal.id)}
      onKeyDown={onKey}
    >
      <span className="gl-card-top">
        <span className="hc-mark" aria-hidden="true" />
        <span className="gl-card-title">{goal.title}</span>
        <span className="gl-card-progress" data-gl-progress={goal.id}>
          {label ?? "No progress yet"}
        </span>
      </span>
      {meta ? <span className="gl-card-meta">{meta}</span> : null}
      <span
        className="gl-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={goal.progress.percent ?? undefined}
        aria-label={`${goal.title} progress`}
      >
        <span className="gl-bar-fill" style={{ width: `${pct}%` }} />
      </span>
      {open ? (
        <span className="gl-card-next" data-gl-next={goal.id}>
          <span className="gl-card-next-label">Next</span>
          <span className="gl-card-next-text">
            {step ? step.title : stepKnown ? "No open task linked" : "…"}
          </span>
          {step && onSchedule ? (
            stepDay ? (
              <span className="gl-card-next-when" data-gl-when={goal.id}>
                {spreadDay(stepDay, today)}
              </span>
            ) : (
              <button
                type="button"
                className="nx-btn nx-btn-text nx-btn-sm gl-card-act"
                data-gl-schedule={goal.id}
                disabled={busy}
                aria-label={`Schedule ${step.title}`}
                onClick={own(() => onSchedule(step.id))}
              >
                Schedule
              </button>
            )
          ) : null}
        </span>
      ) : null}
      {open && planned === false && onPlan ? (
        <button
          type="button"
          className="nx-btn nx-btn-secondary nx-btn-sm gl-card-plan"
          data-gl-plan={goal.id}
          onClick={own(() => onPlan(goal.id))}
        >
          Plan a task
        </button>
      ) : null}
      <span className="gl-card-foot">
        {goal.deadline ? (
          <span className="gl-card-due" data-gl-due={goal.id}>
            by {dayLabel(goal.deadline)}
          </span>
        ) : (
          <span className="gl-card-due">No deadline</span>
        )}
        {open ? (
          <span
            className={`gl-card-risk ${standing.atRisk ? "is-risk" : "is-ok"}`}
            data-gl-risk={standing.atRisk ? "at-risk" : "on-track"}
            title={standing.hint ?? undefined}
          >
            {standing.label}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** The goals as a grid of cards: active ones, then a fold for the closed. */
export function GoalCards(props: GoalCardsProps) {
  const { goals, selectedId, nextSteps, hues, today, onSelect } = props;
  const [showClosed, setShowClosed] = useState(false);
  // at-risk goals lead (the soonest deadline first); the rest keep their order
  const open = sortByRisk(
    goals.filter((g) => g.status === "active"),
    today
  );
  const closed = goals.filter((g) => g.status !== "active");
  const card = (g: GoalView) => {
    const step = nextSteps[g.id] ?? null;
    return (
      <GoalCard
        key={g.id}
        goal={g}
        step={step}
        stepKnown={g.id in nextSteps}
        stepDay={(step && props.stepDays?.[step.id]) || null}
        planned={props.planned?.[g.id]}
        busy={!!props.busy}
        hue={hues?.[g.id]}
        today={today}
        selected={selectedId === g.id}
        onSelect={onSelect}
        onSchedule={props.onSchedule}
        onPlan={props.onPlan}
      />
    );
  };
  return (
    <div className="gl-cards-wrap" data-gl-cards>
      <div className="gl-cards">{open.map(card)}</div>
      {closed.length ? (
        <>
          <button
            type="button"
            className="nx-btn nx-btn-text nx-btn-sm gl-closed-toggle"
            data-gl-closed={showClosed ? "open" : "shut"}
            onClick={() => setShowClosed(!showClosed)}
          >
            {showClosed
              ? "Hide closed goals"
              : `Closed goals (${closed.length})`}
          </button>
          {showClosed ? (
            <div className="gl-cards">{closed.map(card)}</div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
