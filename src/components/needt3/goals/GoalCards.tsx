"use client";

/* Goals as cards (flag `habits_cards_v1`): the habit cards' language on the
   Goals screen. A goal card is its progress, its next step (the first open
   task linked to it), its deadline and, when there is one, a risk hint.
   Colour is a tint and a mark, never a fill: the hue is the first linked
   project's colour. Presentational; the next steps and hues come in as props. */
import { useState } from "react";
import type { CSSProperties } from "react";

import { type GoalView, goalAreaLabel, goalProgressLabel } from "@/lib/goals";

import { goalRisk } from "../habits/cards/model";

export interface GoalCardsProps {
  goals: readonly GoalView[];
  selectedId: string | null;
  /** The first open linked task per goal id; null = none open. */
  nextSteps: Readonly<Record<string, { id: string; title: string } | null>>;
  /** Goal id → a colour (its project's), when it has one. */
  hues?: Readonly<Record<string, string>>;
  /** "YYYY-MM-DD" in the person's zone. */
  today: string;
  onSelect: (id: string) => void;
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
  hue,
  today,
  selected,
  onSelect,
}: {
  goal: GoalView;
  step: { id: string; title: string } | null;
  /** False until the goal's tasks have been read. */
  stepKnown: boolean;
  hue: string | undefined;
  today: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const label = goalProgressLabel(goal.progress);
  const risk = goalRisk(goal, today);
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
  return (
    <button
      type="button"
      className={`gl-card nx-press nx-focus${selected ? " is-on" : ""}`}
      style={hue ? ({ "--hue": hue } as CSSProperties) : undefined}
      data-gl-card={goal.id}
      aria-pressed={selected}
      onClick={() => onSelect(goal.id)}
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
      {goal.status === "active" ? (
        <span className="gl-card-next" data-gl-next={goal.id}>
          <span className="gl-card-next-label">Next</span>
          <span className="gl-card-next-text">
            {step ? step.title : stepKnown ? "No open task linked" : "…"}
          </span>
        </span>
      ) : null}
      <span className="gl-card-foot">
        {goal.deadline ? (
          <span className="gl-card-due" data-gl-due={goal.id}>
            by {dayLabel(goal.deadline)}
          </span>
        ) : (
          <span className="gl-card-due">No deadline</span>
        )}
        {risk ? (
          <span
            className={`gl-card-risk is-${risk.level}`}
            data-gl-risk={risk.level}
          >
            {risk.text}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** The goals as a grid of cards: active ones, then a fold for the closed. */
export function GoalCards(props: GoalCardsProps) {
  const { goals, selectedId, nextSteps, hues, today, onSelect } = props;
  const [showClosed, setShowClosed] = useState(false);
  const open = goals.filter((g) => g.status === "active");
  const closed = goals.filter((g) => g.status !== "active");
  const card = (g: GoalView) => (
    <GoalCard
      key={g.id}
      goal={g}
      step={nextSteps[g.id] ?? null}
      stepKnown={g.id in nextSteps}
      hue={hues?.[g.id]}
      today={today}
      selected={selectedId === g.id}
      onSelect={onSelect}
    />
  );
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
