"use client";

import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";

import { habitColor } from "@/lib/needt3/derive";
import type { V3Habit } from "@/lib/needt3/map";
import { isTaskIconKey, taskIconKey } from "@/lib/needt3/task-icon";
import { notify } from "@/lib/notifications";

import { TaskGlyphBare } from "../../phone/home/TaskGlyph";
import { MONTH_LONG, habitCard } from "../derive";
import type { HabitsController } from "../useHabitsController";
import { cellLabel, chipGlyph, habitStack, monthGrid, pastelAt } from "./model";
import { useSwipeDone } from "./useSwipeDone";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;
/** The habit's colour, else a pastel fixed by its place in the list. */
const hueOf = (h: V3Habit, ctl: HabitsController) =>
  habitColor(h, ctl.projects) ||
  pastelAt(ctl.list.findIndex((x) => x.id === h.id));

const Check = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path
      d="M2.5 6.4 5 8.8l4.5-5.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Writes in flight, so a double press cannot send (or announce) one twice. */
const writing = new Set<string>();

/** The chip's face: the habit's emoji, else the glyph its title earns. */
function HabitChip({ h }: { h: { title: string; icon?: string | null } }) {
  const g = chipGlyph(h);
  if (g) return <>{g}</>;
  return (
    <TaskGlyphBare
      iconKey={isTaskIconKey(h.icon) ? h.icon : taskIconKey(h.title)}
      size={18}
    />
  );
}

/**
 * Marks a habit kept today, and only once the server has it says so, with an
 * Undo. Shared by the swipe, the Done button, the keyboard and the list, so
 * every way of finishing a habit ends in the same notice. The write is pinned
 * to the date it was made on (`setDay`), and Undo is the `undo` the write
 * returned (the inverse of that date, run after the write landed): it neither
 * follows "today" at the moment of the click nor races the request. On
 * failure the hook has already reverted the card and told the person, so
 * there is no notice. Resolves true when it landed.
 */
export async function markDone(
  ctl: HabitsController,
  h: V3Habit
): Promise<boolean> {
  const date = ctl.today;
  const key = `${h.id}:${date}`;
  if (writing.has(key)) return false;
  writing.add(key);
  try {
    const { undo } = await ctl.setDay(h, date, true);
    notify.success(`${h.title} done`, {
      action: { label: "Undo", onClick: () => void undo().catch(() => null) },
    });
    return true;
  } catch {
    return false;
  } finally {
    writing.delete(key);
  }
}

function StackCard({
  h,
  ctl,
  depth,
  refocus,
}: {
  h: V3Habit;
  ctl: HabitsController;
  depth: number;
  /** Set when the card had focus as it was finished: the stack then moves it on. */
  refocus: { current: boolean };
}) {
  const top = depth === 0;
  const finish = () => {
    refocus.current = !!swipe.ref.current?.contains(document.activeElement);
    void markDone(ctl, h).then((ok) => {
      if (!ok) refocus.current = false;
    });
  };
  const swipe = useSwipeDone(finish);
  const card = habitCard(h, ctl.checkins, ctl.today);
  const meta = [card.label, h.schedule.time].filter(Boolean).join(" · ");
  return (
    <div
      ref={swipe.ref}
      className={`hc-card${top ? " is-top" : ""}`}
      style={{ "--hue": hueOf(h, ctl) } as CSSProperties}
      data-hc-card={h.id}
      role="group"
      aria-label={`${h.title}. Swipe right or press Enter to mark it done.`}
      tabIndex={top ? 0 : -1}
      inert={!top}
      onPointerDown={top ? swipe.onPointerDown : undefined}
      onKeyDown={top ? swipe.onKeyDown : undefined}
    >
      <span className="hc-chip" aria-hidden="true">
        <HabitChip h={h} />
      </span>
      <span className="hc-card-main">
        <span className="hc-card-title">{h.title}</span>
        <span className="hc-card-meta">{meta}</span>
      </span>
      {top ? (
        <>
          <button
            type="button"
            className="nx-btn nx-btn-text nx-btn-sm"
            data-hc-edit={h.id}
            onClick={() => ctl.openEdit(h)}
          >
            Edit
          </button>
          <button
            type="button"
            className="hc-check"
            data-hc-done={h.id}
            aria-label={`Mark ${h.title} done`}
            onClick={finish}
          />
        </>
      ) : (
        <span className="hc-check" aria-hidden="true" />
      )}
    </div>
  );
}

/** A habit already kept today: it stays in the column, checked, out of reach. */
function KeptCard({ h, ctl }: { h: V3Habit; ctl: HabitsController }) {
  const card = habitCard(h, ctl.checkins, ctl.today);
  const meta = [card.label, h.schedule.time].filter(Boolean).join(" · ");
  return (
    <div
      className="hc-card is-kept"
      style={{ "--hue": hueOf(h, ctl) } as CSSProperties}
      data-hc-kept={h.id}
      role="group"
      aria-label={`${h.title}. Done today.`}
      inert
    >
      <span className="hc-chip" aria-hidden="true">
        <HabitChip h={h} />
      </span>
      <span className="hc-card-main">
        <span className="hc-card-title">{h.title}</span>
        <span className="hc-card-meta">{meta}</span>
      </span>
      <span className="hc-check is-done" aria-hidden="true">
        <Check />
      </span>
    </div>
  );
}

/**
 * Today's habits as an overlapping column, each card peeking above the next.
 * The front card (the last, fully open) is the one to act on; habits already
 * kept sit above it, checked. Finishing the front one slides the next forward.
 */
export function HabitStack({ ctl }: { ctl: HabitsController }) {
  const stack = habitStack(ctl.list, ctl.checkins, ctl.today);
  const topId = stack[0]?.id;
  const refocus = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const clear = useRef<HTMLParagraphElement>(null);
  // A card finished from the keyboard: focus goes to the next top card, or to
  // the "all done" line when none is left, never to the page.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    const next = root.current?.querySelector<HTMLElement>(".hc-card.is-top");
    (next ?? clear.current)?.focus();
  }, [topId]);
  const open = new Set(stack.map((h) => h.id));
  const kept = ctl.list.filter(
    (h) =>
      !open.has(h.id) && !h.isSample && habitCard(h, ctl.checkins, ctl.today).on
  );
  return (
    <div ref={root} className="hc-today-body">
      {kept.length || stack.length ? (
        <div className="hc-stack" data-hc-stack={stack.length}>
          {kept.map((h) => (
            <KeptCard key={`kept:${h.id}`} h={h} ctl={ctl} />
          ))}
          {[...stack].reverse().map((h, i) => (
            <StackCard
              key={h.id}
              h={h}
              ctl={ctl}
              depth={stack.length - 1 - i}
              refocus={refocus}
            />
          ))}
        </div>
      ) : null}
      {stack.length ? null : (
        <p className="hc-clear" data-hc-clear="" tabIndex={-1} ref={clear}>
          {ctl.list.length ? "Nothing left for today." : "No habits yet."}
        </p>
      )}
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
                    card.on
                      ? void ctl.setDay(h, ctl.today, false).catch(() => null)
                      : void markDone(ctl, h)
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
export function HabitCardsPanel({
  ctl,
  past,
}: {
  ctl: HabitsController;
  /** The face's own per-habit past-day editor, under "Edit past days". */
  past?: ReactNode;
}) {
  // The same habits the stack counts: no first-run example, none off today.
  const todays = ctl.list.filter((h) => habitStack([h], [], ctl.today).length);
  const kept = todays.filter(
    (h) => habitCard(h, ctl.checkins, ctl.today).on
  ).length;
  return (
    <div className="hc-panel" data-hc-panel="">
      <div className="hc-top">
        <section className="hc-today" aria-label="Today">
          <div className="hc-head">
            <h2 className="hc-head-title">Today</h2>
            <span className="hc-head-count">
              {kept} of {todays.length} done
            </span>
          </div>
          <HabitStack ctl={ctl} />
        </section>
        <HabitMonthGrid ctl={ctl} />
      </div>
      {past ? (
        <details className="hc-past" data-hc-past="">
          <summary className="hc-past-sum">Edit past days</summary>
          <div className="hc-past-body">{past}</div>
        </details>
      ) : null}
      <HabitList ctl={ctl} />
    </div>
  );
}
