import { useEffect, useMemo, useState } from "react";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  newDate,
  newDateFromYMD,
  startOfMonth,
  startOfWeek,
  subDays,
} from "@/lib/date-utils";
import { useWeekStartDay } from "@/lib/needt3/hooks/settings";
import { cn } from "@/lib/utils";

interface MiniCalendarProps {
  currentDate: Date;
  onDateClick?: (date: Date) => void;
  compact?: boolean;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = Array.from({ length: 12 }, (_, month) =>
  format(newDateFromYMD(2026, month, 1), "MMM")
);

export function MiniCalendar({
  currentDate,
  onDateClick,
  compact = false,
}: MiniCalendarProps) {
  const [calendarDate, setCalendarDate] = useState(currentDate);
  // isToday() calls `new Date()` at render time, resolved in whichever
  // timezone the process is running in — the Next.js server and the user's
  // browser can disagree on what day it currently is (different system
  // timezones, not just render timing), producing a hydration mismatch on
  // the today-styled day cell. Only trust it once mounted on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const weekStartDay = useWeekStartDay();
  const weekStartsOn = weekStartDay === "monday" ? 1 : 0;
  const weekdays = useMemo(
    () => (weekStartsOn === 1 ? [...WEEKDAYS.slice(1), WEEKDAYS[0]] : WEEKDAYS),
    [weekStartsOn]
  );

  useEffect(() => {
    setCalendarDate(currentDate);
  }, [currentDate]);

  const visibleDays = useMemo(() => {
    const monthStart = startOfMonth(calendarDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn });
    const gridEnd = endOfWeek(endOfMonth(calendarDate), { weekStartsOn });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [calendarDate, weekStartsOn]);

  const jumpWeek = (amount: -7 | 7) => {
    const next = amount < 0 ? subDays(currentDate, 7) : addDays(currentDate, 7);
    setCalendarDate(next);
    onDateClick?.(next);
  };

  const handleToday = () => {
    const today = newDate();
    setCalendarDate(today);
    onDateClick?.(today);
  };

  const selectMonth = (month: number) => {
    const next = newDate(calendarDate);
    next.setDate(1);
    next.setMonth(month);
    setCalendarDate(next);
    onDateClick?.(next);
  };

  return (
    <div className={cn("select-none", compact ? "px-1 py-1.5" : "p-1.5")}>
      <div className="mb-1.5 flex h-6 items-center gap-1 px-0.5">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="group flex min-w-0 items-center gap-1 rounded px-0.5 text-[13px] font-semibold text-[var(--text-primary)] hover:bg-[var(--menu-item-hover)]"
              aria-label="Choose month"
            >
              <span>{format(calendarDate, "MMMM yyyy")}</span>
              <CalendarDays className="h-3 w-3 text-[var(--text-secondary)] opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={5}
            className="w-[220px] p-2"
          >
            <div className="mb-2 flex items-center justify-between px-1 text-[13px] font-semibold">
              <button
                type="button"
                onClick={() =>
                  setCalendarDate(
                    newDateFromYMD(
                      calendarDate.getFullYear() - 1,
                      calendarDate.getMonth(),
                      1
                    )
                  )
                }
                className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--menu-item-hover)]"
                aria-label="Previous year"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              {calendarDate.getFullYear()}
              <button
                type="button"
                onClick={() =>
                  setCalendarDate(
                    newDateFromYMD(
                      calendarDate.getFullYear() + 1,
                      calendarDate.getMonth(),
                      1
                    )
                  )
                }
                className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--menu-item-hover)]"
                aria-label="Next year"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {MONTHS.map((month, index) => (
                <button
                  key={month}
                  type="button"
                  onClick={() => selectMonth(index)}
                  className={cn(
                    "h-7 rounded text-[12px] transition-colors hover:bg-[var(--menu-item-hover)]",
                    index === calendarDate.getMonth() &&
                      "bg-[var(--surface-selected)] text-[var(--text-inverse)] hover:bg-[var(--surface-selected)]"
                  )}
                >
                  {month}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={handleToday}
            className="h-5 rounded-md border border-[var(--calendar-toolbar-border)] bg-[var(--calendar-toolbar-bg)] px-2 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--calendar-toolbar-bg-hover)]"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => jumpWeek(-7)}
            className="grid h-5 w-5 place-items-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--menu-item-hover)] hover:text-[var(--text-primary)]"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => jumpWeek(7)}
            className="grid h-5 w-5 place-items-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--menu-item-hover)] hover:text-[var(--text-primary)]"
            aria-label="Next week"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {weekdays.map((day) => (
          <div
            key={day}
            className="flex h-6 items-center justify-center text-[11px] font-semibold text-[var(--text-secondary)]"
          >
            {day}
          </div>
        ))}

        {visibleDays.map((day) => {
          // currentDate ultimately traces back to `newDate()` evaluated once
          // at useViewStore's module init — separately on the server and
          // again when the client bundle loads, so it carries the same
          // server/client timezone skew as isToday() below.
          const selected = mounted && isSameDay(day, currentDate);
          const today = mounted && isToday(day);
          const currentMonth = isSameMonth(day, calendarDate);
          return (
            <div key={day.toISOString()} className="flex justify-center">
              <button
                type="button"
                onClick={() => onDateClick?.(day)}
                aria-label={`${today ? "TODAY " : ""}${format(day, "d")}`}
                className={cn(
                  "relative flex h-6 w-6 items-center justify-center rounded-md border border-transparent bg-transparent text-[12px] transition-[border-color,background-color,color] duration-150 hover:border-[var(--text-secondary)]",
                  selected
                    ? "border-[var(--text-primary)] font-semibold text-[var(--text-primary)]"
                    : currentMonth
                      ? "text-[var(--text-primary)] hover:bg-[var(--surface-raised)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-panel)]"
                )}
              >
                {today && (
                  <span className="absolute left-1/2 top-px -translate-x-1/2 text-[4px] font-bold leading-none text-[var(--color-danger)]">
                    TODAY
                  </span>
                )}
                {format(day, "d")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
