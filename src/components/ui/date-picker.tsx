"use client";

import { useMemo, useState } from "react";

import { CalendarDays, Clock3, X } from "lucide-react";

import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetTitle,
  BottomSheetTrigger,
} from "@/components/ui/bottom-sheet";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  addDays,
  format,
  isToday,
  isTomorrow,
  newDate,
  startOfWeek,
} from "@/lib/date-utils";
import { useWeekStartDay } from "@/lib/needt3/hooks/settings";
import { cn } from "@/lib/utils";

import { useIsMobile } from "@/hooks/use-is-mobile";

interface DatePickerProps {
  value?: Date | null;
  onChange: (date: Date | null) => void;
  includeTime?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  accent?: boolean;
  showIcon?: boolean;
  labelFormat?: string;
}

interface Shortcut {
  label: string;
  date: Date;
}

function withExistingTime(date: Date, value?: Date | null): Date {
  const next = new Date(date);
  const source = value ?? newDate();
  next.setHours(source.getHours(), source.getMinutes(), 0, 0);
  return next;
}

function shortcutDates(weekStartsOn: 0 | 1): Shortcut[] {
  const today = newDate();
  const nextWeek = startOfWeek(addDays(today, 7), { weekStartsOn });
  const inTwoWeeks = startOfWeek(addDays(today, 14), { weekStartsOn });
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  return [
    { label: "Today", date: today },
    { label: "Tomorrow", date: addDays(today, 1) },
    { label: "Next week", date: nextWeek },
    { label: "Next month", date: nextMonth },
    { label: "In 2 weeks", date: inTwoWeeks },
  ];
}

function formatHeaderDate(value?: Date | null): string {
  if (!value) return "Choose a date";
  if (isToday(value)) return "Today";
  if (isTomorrow(value)) return "Tomorrow";
  return format(value, "EEE MMM d");
}

export function DatePicker({
  value,
  onChange,
  includeTime = false,
  placeholder = "Choose date",
  ariaLabel = "Choose date",
  className,
  accent = false,
  showIcon = true,
  labelFormat,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile(640);

  const trigger = (
    <button
      type="button"
      aria-label={ariaLabel}
      className={cn(
        "group flex min-w-0 items-center gap-1.5 rounded-md text-left transition-colors duration-150 hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--control-border)]",
        isMobile ? "min-h-11 px-3 text-[16px]" : "min-h-7 px-1.5 text-[13px]",
        accent ? "text-[var(--color-accent)]" : "text-[var(--text-primary)]",
        !value && "text-[var(--text-muted)]",
        className
      )}
    >
      {showIcon && (
        <CalendarDays className="h-3.5 w-3.5 flex-none opacity-70" />
      )}
      <span className="min-w-0 flex-1 truncate">
        {value
          ? format(
              value,
              labelFormat ?? (includeTime ? "EEE MMM d, h:mm a" : "EEE MMM d")
            )
          : placeholder}
      </span>
    </button>
  );

  if (isMobile) {
    return (
      <BottomSheet open={open} onOpenChange={setOpen}>
        <BottomSheetTrigger asChild>{trigger}</BottomSheetTrigger>
        <BottomSheetContent className="max-h-[88dvh] p-0">
          <BottomSheetTitle className="sr-only">{ariaLabel}</BottomSheetTitle>
          <BottomSheetDescription className="sr-only">
            Pick a date or choose a shortcut.
          </BottomSheetDescription>
          <DatePickerPanel
            value={value}
            includeTime={includeTime}
            onChange={onChange}
            onDone={() => setOpen(false)}
            mobile
          />
        </BottomSheetContent>
      </BottomSheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[443px] overflow-hidden p-0"
      >
        <DatePickerPanel
          value={value}
          includeTime={includeTime}
          onChange={onChange}
          onDone={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function DatePickerPanel({
  value,
  includeTime,
  onChange,
  onDone,
  mobile = false,
}: {
  value?: Date | null;
  includeTime: boolean;
  onChange: (date: Date | null) => void;
  onDone: () => void;
  mobile?: boolean;
}) {
  const weekStartsOn = useWeekStartDay() === "sunday" ? 0 : 1;
  const shortcuts = useMemo(
    () => shortcutDates(weekStartsOn),
    [weekStartsOn]
  );
  const selectDate = (date: Date | undefined) => {
    if (!date) return;
    onChange(withExistingTime(date, value));
    if (!includeTime) onDone();
  };

  return (
    <div
      className={cn(
        "grid bg-[var(--popover-bg)]",
        mobile ? "grid-cols-1" : "grid-cols-[261px_180px]"
      )}
    >
      <div
        className={cn(
          "min-w-0",
          mobile ? "pb-2" : "border-r border-[var(--menu-border)] py-2"
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-1 border-b border-[var(--menu-border)] px-3 text-[13px] text-[var(--text-primary)]",
            mobile ? "h-12" : "h-[30px] pb-2"
          )}
        >
          <div className="flex min-w-0 items-center gap-1">
            <CalendarDays className="h-4 w-4 flex-none text-[var(--text-muted)]" />
            <span className="truncate font-normal">{formatHeaderDate(value)}</span>
          </div>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className={cn(
                "grid flex-none place-items-center rounded-md border border-transparent text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--control-border)]",
                mobile ? "h-11 w-11" : "h-5 w-5"
              )}
              aria-label="Clear date"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className={cn(mobile ? "px-3 pt-3" : "px-1 pt-3")}>
          <Calendar
            mode="single"
            selected={value ?? undefined}
            defaultMonth={value ?? undefined}
            onSelect={selectDate}
            weekStartsOn={weekStartsOn}
            fixedWeeks
            className={cn("mx-auto p-0", mobile ? "w-[280px]" : "w-[252px]")}
          />
        </div>
        {includeTime && (
          <div className="mt-2 flex min-h-12 items-center gap-2 border-t border-[var(--menu-border)] px-3 py-2">
            <Clock3 className="h-4 w-4 text-[var(--text-muted)]" />
            <span className="text-[13px] text-[var(--text-secondary)]">Time</span>
            <input
              type="time"
              value={value ? format(value, "HH:mm") : ""}
              onChange={(event) => {
                if (!event.target.value) return;
                const [hours, minutes] = event.target.value
                  .split(":")
                  .map(Number);
                const next = value ? new Date(value) : newDate();
                next.setHours(hours, minutes, 0, 0);
                onChange(next);
              }}
              className={cn(
                "ml-auto rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 text-[var(--text-primary)] outline-none transition-colors hover:bg-[var(--control-bg)] focus:border-[var(--text-muted)]",
                mobile ? "h-11 text-[16px]" : "h-7 text-[13px]"
              )}
            />
            <button
              type="button"
              onClick={onDone}
              className={cn(
                "rounded-md border border-[var(--button-primary-border)] bg-[var(--button-primary-bg)] px-3 font-medium text-[var(--button-primary-fg)] shadow-[var(--button-primary-shadow)] hover:bg-[var(--button-primary-bg-hover)]",
                mobile ? "h-11 text-[13px]" : "h-7 text-[13px]"
              )}
            >
              Done
            </button>
          </div>
        )}
      </div>

      <div
        className={cn(
          "border-[var(--menu-border)]",
          mobile
            ? "grid grid-cols-2 border-t bg-[var(--surface-control)] p-2"
            : "bg-[var(--surface-control)] p-1"
        )}
      >
        {shortcuts.map((shortcut) => (
          <button
            key={shortcut.label}
            type="button"
            onClick={() => {
              onChange(withExistingTime(shortcut.date, value));
              if (!includeTime) onDone();
            }}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md text-left text-[13px] leading-[18px] text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--menu-item-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--control-border)]",
              mobile
                ? "min-h-12 px-3 last:col-span-2"
                : "h-[30px] px-2 py-1.5"
            )}
          >
            <span className="font-normal">{shortcut.label}</span>
            <span className="text-[var(--text-muted)]">
              {format(shortcut.date, "EEE MMM d")}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
