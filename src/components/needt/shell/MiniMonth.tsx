"use client";

/* A MONTH, SMALL — and a place to act on a day, not only to look at one.
 *
 * Two things share one 10px slot under each date: at rest the day's LOAD, and
 * under the hand the day's MENU. The affordance therefore costs no extra
 * height, and a heavy week is visible without opening one.
 *
 * The load is derived, never seeded. The kit carried a hand-written LOAD map,
 * which is a second copy of a fact the tasks already state — the class of bug
 * `fixture.ts` exists to end. A month with no tasks in it has no dots, and
 * that is honest.
 *
 * PORT.md §8: hover is ONE delegated listener on the grid, not forty-two
 * handlers. Nothing here measures anything during a pointer move; the menu
 * reads a rectangle on click, which happens once.
 */
import * as React from "react";

import { createPortal } from "react-dom";
import type { IconType } from "react-icons";
import {
  LuBan,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuRotateCcw,
  LuSunrise,
  LuSunset,
} from "react-icons/lu";

import { addCalendarDays, newDateFromYMD, startOfDay } from "@/lib/date-utils";
import { parseDueDate } from "@/lib/needt/derive";
import { MONTHS } from "@/lib/needt/fixture";
import { useWeekStartDay } from "@/lib/needt3/hooks/settings";
import type { NeedtTask } from "@/lib/needt/types";

import { Glyph, IconButton } from "./chrome";

/** Monday first: the product's week starts where the working week does. */
const DOW = ["M", "T", "W", "T", "F", "S", "S"] as const;
const DOW_SUNDAY = ["S", "M", "T", "W", "T", "F", "S"] as const;

/** An eleven-hour day. The denominator the load dot is a fraction of. */
const DAY_MINUTES = 660;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/* The five things you can say to a day. Every one of them is about hours the
   scheduler may or may not use — which is the only thing a day owns. */
const DAY_ACTIONS: readonly [IconType, string, string][] = [
  [
    LuSunrise,
    "Start the day later",
    "Move today's tasks to when you are ready.",
  ],
  [LuSunset, "Finish early", "Reschedule what is left of the day."],
  [LuBan, "Block out hours", "Pick hours the scheduler cannot use."],
  [LuBan, "Block out the whole day", "Nothing gets placed here."],
  [LuRotateCcw, "Unblock the day", "Every hour is available again."],
];

interface MenuAt {
  label: string;
  x: number;
  y: number;
}

function DayMenu({ at, onClose }: { at: MenuAt; onClose: () => void }) {
  React.useEffect(() => {
    function away(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".nt-menu")) {
        onClose();
      }
    }
    function esc(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    /* Next tick: the click that opened this menu is still on its way up. */
    const id = window.setTimeout(
      () => document.addEventListener("mousedown", away),
      0
    );
    document.addEventListener("keydown", esc);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  /* On the body, not in the rail: a screen with a transform re-bases fixed
     coordinates, so a menu placed from a rectangle has to escape it. */
  return createPortal(
    <div
      className="nt-menu"
      role="menu"
      style={{ position: "fixed", left: at.x, top: at.y, width: 268 }}
    >
      <div className="nt-menu-label">{at.label}</div>
      {DAY_ACTIONS.map(([icon, label, hint]) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          className="nt-menu-item"
          onClick={onClose}
          style={{
            height: "auto",
            alignItems: "flex-start",
            padding: "7px 8px",
            gap: 8,
          }}
        >
          <span style={{ paddingTop: 2 }}>
            <Glyph of={icon} size={16} />
          </span>
          <span
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 1,
              minWidth: 0,
            }}
          >
            <span
              style={{
                font: "var(--type-ui-medium)",
                color: "var(--text-primary)",
              }}
            >
              {label}
            </span>
            <span
              style={{
                font: "var(--type-meta)",
                color: "var(--text-muted)",
                textWrap: "pretty",
              }}
            >
              {hint}
            </span>
          </span>
        </button>
      ))}
    </div>,
    document.body
  );
}

/** One day, as a stable key. Local parts only — never an ISO string, which
    would shift the day across a timezone. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

interface Cell {
  key: string;
  date: Date;
  day: number;
  outside: boolean;
}

/** The 5- or 6-row grid the month is drawn on, from the week-start day. */
function monthCells(month: Date, sunday: boolean): Cell[] {
  const year = month.getFullYear();
  const index = month.getMonth();
  const first = newDateFromYMD(year, index, 1);
  /* Day 0 of the next month is the last day of this one. */
  const last = newDateFromYMD(year, index + 1, 0);
  const shift = sunday ? 0 : 6;
  const lead = (first.getDay() + shift) % 7;
  const trail = 6 - ((last.getDay() + shift) % 7);
  const start = addCalendarDays(first, -lead);
  const total = lead + last.getDate() + trail;

  const cells: Cell[] = [];
  for (let i = 0; i < total; i++) {
    const date = addCalendarDays(start, i);
    cells.push({
      key: dayKey(date),
      date,
      day: date.getDate(),
      outside: date.getMonth() !== index,
    });
  }
  return cells;
}

/** Open minutes per day key, read off the tasks' own deadlines. */
function loadByDay(
  tasks: readonly NeedtTask[],
  today: Date
): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const task of tasks) {
    if (task.done || !task.est) continue;
    const due = parseDueDate(task.due, today);
    if (!due) continue;
    const key = dayKey(due);
    out.set(key, (out.get(key) ?? 0) + task.est);
  }
  return out;
}

export interface MiniMonthProps {
  /** The day the app calls today. */
  today: Date;
  /** The selected day, or `null`. */
  selected: Date | null;
  onSelect: (date: Date) => void;
  tasks: readonly NeedtTask[];
  /** Set by the drag layer when it lands on a day, once that layer exists. */
  dragOverKey?: string | null;
}

export function MiniMonth({
  today,
  selected,
  onSelect,
  tasks,
  dragOverKey = null,
}: MiniMonthProps) {
  const [month, setMonth] = React.useState(() =>
    newDateFromYMD(today.getFullYear(), today.getMonth(), 1)
  );
  const [hover, setHover] = React.useState<string | null>(null);
  const [menu, setMenu] = React.useState<MenuAt | null>(null);

  const sunday = useWeekStartDay() === "sunday";
  const cells = React.useMemo(
    () => monthCells(month, sunday),
    [month, sunday]
  );
  const load = React.useMemo(() => loadByDay(tasks, today), [tasks, today]);

  const todayKey = dayKey(today);
  const selectedKey = selected ? dayKey(selected) : null;

  /* One listener for forty-two cells. A handler per cell is the sidebar's
     version of a ResizeObserver per card. */
  const onOver = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const cell = target.closest<HTMLElement>("[data-cell-key]");
      setHover(cell?.dataset.cellKey ?? null);
    },
    []
  );

  const shift = (by: number) =>
    setMonth((current) =>
      newDateFromYMD(current.getFullYear(), current.getMonth() + by, 1)
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 24,
          padding: "0 2px",
        }}
      >
        <span
          style={{
            font: "var(--type-ui-medium)",
            color: "var(--text-primary)",
          }}
        >
          {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
        </span>
        <span style={{ display: "flex", gap: 2 }}>
          <IconButton
            label="Previous month"
            icon={<Glyph of={LuChevronLeft} size={14} />}
            onClick={() => shift(-1)}
          />
          <IconButton
            label="Next month"
            icon={<Glyph of={LuChevronRight} size={14} />}
            onClick={() => shift(1)}
          />
        </span>
      </div>

      <div
        onMouseOver={onOver}
        onMouseLeave={() => setHover(null)}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 1,
        }}
      >
        {(sunday ? DOW_SUNDAY : DOW).map((letter, i) => (
          <span
            key={`${letter}${i}`}
            style={{
              display: "grid",
              placeItems: "center",
              height: 14,
              font: "var(--type-meta-medium)",
              fontSize: 11,
              color: "var(--text-muted)",
            }}
          >
            {letter}
          </span>
        ))}

        {cells.map((cell) => {
          const fraction = cell.outside
            ? 0
            : (load.get(cell.key) ?? 0) / DAY_MINUTES;
          const isToday = cell.key === todayKey;
          const isSelected = cell.key === selectedKey;
          const isOver = cell.key === dragOverKey;
          const isHot = !cell.outside && hover === cell.key;
          const label = `${cell.day} ${MONTHS[cell.date.getMonth()]}`;

          return (
            <div
              key={cell.key}
              data-cell-key={cell.outside ? undefined : cell.key}
              style={{ position: "relative" }}
            >
              <button
                type="button"
                /* The drop hooks the drag layer will look for. */
                data-drop={cell.outside ? undefined : "day"}
                data-date={cell.outside ? undefined : cell.key}
                data-label={label}
                disabled={cell.outside}
                onClick={() => onSelect(startOfDay(cell.date))}
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: "100%",
                  height: 30,
                  border: 0,
                  cursor: "default",
                  borderRadius: "var(--radius-md)",
                  background: isOver
                    ? "var(--fill-accent-strong)"
                    : isSelected
                      ? "var(--fill-accent)"
                      : isToday
                        ? "var(--fill-accent-strong)"
                        : isHot
                          ? "var(--fill-3)"
                          : "transparent",
                  boxShadow: isOver ? "var(--shadow-focus)" : "none",
                  font: "var(--type-ui)",
                  color: cell.outside
                    ? "var(--text-disabled)"
                    : isSelected || isToday
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                  fontVariantNumeric: "tabular-nums",
                  transition: "background-color var(--transition-hover)",
                }}
              >
                {cell.day}
              </button>

              {cell.outside ? null : isHot ? (
                <button
                  type="button"
                  aria-label={`Actions for ${label}`}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setMenu({
                      label: `${cell.day} ${MONTH_NAMES[cell.date.getMonth()]}`,
                      x: Math.min(rect.left, window.innerWidth - 280),
                      y: Math.min(rect.bottom + 4, window.innerHeight - 320),
                    });
                  }}
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: 0,
                    transform: "translateX(-50%)",
                    display: "grid",
                    placeItems: "center",
                    width: 14,
                    height: 10,
                    padding: 0,
                    border: 0,
                    background: "transparent",
                    cursor: "default",
                    color: "var(--text-quaternary)",
                  }}
                >
                  <Glyph of={LuChevronDown} size={11} />
                </button>
              ) : fraction > 0 ? (
                <span
                  aria-hidden="true"
                  title={`${Math.round(fraction * DAY_MINUTES)} min booked`}
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: 2,
                    transform: "translateX(-50%)",
                    width: fraction >= 0.75 ? 4 : 3,
                    height: fraction >= 0.75 ? 4 : 3,
                    borderRadius: "var(--radius-pill)",
                    background:
                      fraction >= 0.9
                        ? "var(--text-secondary)"
                        : fraction >= 0.5
                          ? "var(--text-quaternary)"
                          : "var(--text-disabled)",
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {menu ? <DayMenu at={menu} onClose={() => setMenu(null)} /> : null}
    </div>
  );
}
