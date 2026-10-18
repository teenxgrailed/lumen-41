"use client";

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
      <span className="pb-quick-label">{label}</span>
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
 * The reusable block for a day: its personal time as quiet rows, and the
 * presets under them. Home's day mounts this with its own date.
 */
export function PersonalDay({
  date,
  className,
  quick = true,
}: {
  date: string;
  className?: string;
  /** Show the one-tap presets under the rows. */
  quick?: boolean;
}) {
  return (
    <section
      className={`pb-section${className ? ` ${className}` : ""}`}
      aria-label="Personal time"
      data-personal-section={date}
    >
      <PersonalDayBands date={date} />
      {quick ? <PersonalQuickAdd date={date} /> : null}
    </section>
  );
}
