"use client";

import { useState } from "react";

import { formatInTimeZone, fromZonedTime, newDate } from "@/lib/date-utils";
import { useQuickPersonal } from "@/lib/needt3/hooks/personal";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { PERSONAL_PRESETS, type PersonalPreset } from "@/lib/personal-time";

import { PersonalDayBands } from "./PersonalBand";
import { lengthLabel } from "./menu-items";

/**
 * One tap keeps time for the person on `date`: today from the next half hour,
 * any other day at the preset's usual hour. Used under a day (Home, the
 * phone's day); the Create menu and the calendar's empty slot have their own
 * entry points to the same hook.
 */
export function PersonalQuickAdd({
  date,
  label = "Keep time for you",
  className,
}: {
  date: string;
  label?: string;
  className?: string;
}) {
  const tz = useTimeZone();
  const keep = useQuickPersonal();
  const pick = (preset: PersonalPreset) => {
    const today = formatInTimeZone(newDate(), tz, "yyyy-MM-dd");
    void keep(
      preset,
      date === today
        ? undefined
        : fromZonedTime(`${date}T${preset.at}:00`, tz).toISOString()
    );
  };
  return (
    <div
      className={`pb-quick${className ? ` ${className}` : ""}`}
      data-personal-quick={date}
    >
      {label ? <span className="pb-quick-label">{label}</span> : null}
      {PERSONAL_PRESETS.map((preset) => (
        <button
          key={preset.kind}
          type="button"
          className="pb-quick-chip"
          data-pb-preset={preset.kind}
          title={`${preset.title}, ${lengthLabel(preset.minutes)}`}
          onClick={() => pick(preset)}
        >
          <span aria-hidden="true" className="pb-glyph">
            {preset.emoji}
          </span>
          {preset.title}
        </button>
      ))}
    </div>
  );
}

/**
 * The reusable block for a day: its personal time as quiet rows, and a quiet
 * "Keep time for you" that opens the presets. Home's day mounts this with its
 * own date. When the day has no personal time, only that link is drawn.
 */
export function PersonalDay({
  date,
  className,
  quick = true,
  bands = true,
}: {
  date: string;
  className?: string;
  /** Offer the one-tap presets under the rows. */
  quick?: boolean;
  /** Draw the day's blocks as rows (Home's timeline draws them itself). */
  bands?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section
      className={`pb-section${className ? ` ${className}` : ""}`}
      aria-label="Personal time"
      data-personal-section={date}
    >
      {bands ? <PersonalDayBands date={date} /> : null}
      {quick ? (
        <>
          <button
            type="button"
            className="nx-btn nx-btn-text nx-btn-sm pb-keep"
            aria-expanded={open}
            data-pb-keep=""
            onClick={() => setOpen((on) => !on)}
          >
            Keep time for you
          </button>
          {open ? <PersonalQuickAdd date={date} label="" /> : null}
        </>
      ) : null}
    </section>
  );
}
