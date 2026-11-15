"use client";

import type { CSSProperties } from "react";

import { habitColor } from "@/lib/needt3/derive";
import type { V3Habit } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

import { MONTH_LONG, habitCard } from "../derive";
import type { HabitsController } from "../useHabitsController";
import { cellLabel, habitStack, monthGrid } from "./model";
import { useSwipeDone } from "./useSwipeDone";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;
/** How many cards show in the stack: the top one, and two edges behind it. */
const VISIBLE = 3;

const hueOf = (h: V3Habit, ctl: HabitsController) =>
  habitColor(h, ctl.projects) || "var(--text-tertiary)";

/**
 * Marks a habit kept today and says so with an Undo. Shared by the swipe, the
 * Done button, the keyboard and the list below, so every way of finishing a
 * habit ends in the same notice.
 */
export function markDone(ctl: HabitsController, h: V3Habit) {
  ctl.tick(h, true);
  notify.success(`${h.title} done`, {
    action: { label: "Undo", onClick: () => ctl.tick(h, false) },
  });
}

function StackCard({
  h,
  ctl,
  depth,
}: {
  h: V3Habit;
  ctl: HabitsController;
  depth: number;
}) {
  const top = depth === 0;
  const swipe = useSwipeDone(() => markDone(ctl, h));
  const card = habitCard(h, ctl.checkins, ctl.today);
  const meta = [card.label, h.schedule.time].filter(Boolean).join(" · ");
  return (
    <div
      ref={swipe.ref}
      className={`hc-card${top ? " is-top" : ""}`}
      style={{ "--hue": hueOf(h, ctl), "--i": depth } as CSSProperties}
      data-hc-card={h.id}
      role="group"
      aria-label={`${h.title}. Swipe right or press Enter to mark it done.`}
      tabIndex={top ? 0 : -1}
      inert={!top}
      onPointerDown={top ? swipe.onPointerDown : undefined}
      onKeyDown={top ? swipe.onKeyDown : undefined}
    >
      <span className="hc-mark" aria-hidden="true" />
      <span className="hc-card-main">
        <span className="hc-card-title">{h.title}</span>
        <span className="hc-card-meta">{meta}</span>
      </span>
      {top ? (
        <span className="hc-card-actions">
          <button
            type="button"
            className="nx-btn nx-btn-secondary nx-btn-sm"
            data-hc-done={h.id}
            onClick={() => markDone(ctl, h)}
          >
            Done
          </button>
          <button
            type="button"
            className="nx-btn nx-btn-text nx-btn-sm"
            data-hc-edit={h.id}
            onClick={() => ctl.openEdit(h)}
          >
            Edit
          </button>
        </span>
      ) : null}
    </div>
  );
}

/** Today's habits still to do, as a stack: the top card is the one to act on. */
export function HabitStack({ ctl }: { ctl: HabitsController }) {
  const stack = habitStack(ctl.list, ctl.checkins, ctl.today);
  if (!stack.length) {
    return (
      <p className="hc-clear" data-hc-clear="">
        {ctl.list.length ? "All done for today." : "No habits yet."}
      </p>
    );
  }
  const shown = stack.slice(0, VISIBLE);
  return (
    <div className="hc-stack" data-hc-stack={stack.length}>
      {shown.map((h, i) => (
        <StackCard key={h.id} h={h} ctl={ctl} depth={i} />
      ))}
    </div>
  );
}

/** This month, a day a cell, coloured by how many of today's habits were kept. */
export function HabitMonthGrid({ ctl }: { ctl: HabitsController }) {
  const total = ctl.list.length;
  const grid = monthGrid(
    ctl.today,
    ctl.list.map((h) => h.id),
    ctl.history
  );
  return (
    <section className="hc-month" aria-label={`${MONTH_LONG[grid.month]}`}>
      <div className="hc-month-head">
        <span className="hc-month-name">{MONTH_LONG[grid.month]}</span>
        <span className="hc-legend" aria-hidden="true">
          <span className="hc-legend-item" data-level="1">
            Some
          </span>
          <span className="hc-legend-item" data-level="2">
            Most
          </span>
          <span className="hc-legend-item" data-level="3">
            All
          </span>
        </span>
      </div>
      <div className="hc-grid" data-hc-grid={grid.key} role="list">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="hc-weekday" aria-hidden="true">
            {d}
          </span>
        ))}
        {Array.from({ length: grid.lead }, (_, i) => (
          <span
            key={`lead${i}`}
            className="hc-day is-lead"
            aria-hidden="true"
          />
        ))}
        {grid.cells.map((c) => (
          <span
            key={c.date}
            className={`hc-day${c.today ? " is-today" : ""}`}
            role="listitem"
            data-hc-day={c.date}
            data-level={c.level ?? "ahead"}
            aria-label={cellLabel(c, total)}
          >
            {c.day}
          </span>
        ))}
      </div>
    </section>
  );
}

/** Every habit, kept or not: unmark one, edit it, or archive it. */
function HabitList({ ctl }: { ctl: HabitsController }) {
  if (!ctl.list.length) return null;
  return (
    <section className="hc-all" aria-label="All habits">
      <h2 className="hc-head-title">All habits</h2>
      <ul className="hc-all-list">
        {ctl.shown.map((h) => {
          const card = habitCard(h, ctl.checkins, ctl.today);
          return (
            <li
              key={h.id}
              className="hc-all-row"
              style={{ "--hue": hueOf(h, ctl) } as CSSProperties}
              data-hc-row={h.id}
            >
              <span className="hc-mark" aria-hidden="true" />
              <span className="hc-card-main">
                <span className="hc-card-title">{h.title}</span>
                <span className="hc-card-meta">{card.label}</span>
              </span>
              <span className="hc-card-actions">
                <button
                  type="button"
                  className="nx-btn nx-btn-text nx-btn-sm"
                  aria-pressed={card.on}
                  data-hc-toggle={h.id}
                  onClick={() =>
                    card.on ? ctl.tick(h, false) : markDone(ctl, h)
                  }
                >
                  {card.on ? "Undo" : "Done"}
                </button>
                <button
                  type="button"
                  className="nx-btn nx-btn-text nx-btn-sm"
                  onClick={() => ctl.openEdit(h)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="nx-btn nx-btn-text nx-btn-sm"
                  onClick={() => void ctl.archive(h)}
                >
                  Archive
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {ctl.over ? (
        <button
          type="button"
          className="nx-btn nx-btn-text nx-btn-sm"
          onClick={() => ctl.setAll(!ctl.all)}
        >
          {ctl.all ? "Show fewer" : `Show all ${ctl.list.length}`}
        </button>
      ) : null}
    </section>
  );
}

/**
 * The Habits screen's body behind `habits_cards_v1`: the stack, the month
 * grid, and the full list. The screens around it (header, Quit, the new /
 * edit sheet) are the existing ones, so nothing a person could do before is
 * lost.
 */
export function HabitCardsPanel({ ctl }: { ctl: HabitsController }) {
  const { list, kept } = ctl;
  return (
    <div className="hc-panel" data-hc-panel="">
      <section className="hc-today" aria-label="Today">
        <div className="hc-head">
          <h2 className="hc-head-title">Today</h2>
          <span className="hc-head-count">
            {kept} of {list.length} done
          </span>
        </div>
        <HabitStack ctl={ctl} />
      </section>
      <HabitMonthGrid ctl={ctl} />
      <HabitList ctl={ctl} />
    </div>
  );
}
