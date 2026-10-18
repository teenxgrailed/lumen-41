"use client";

import { usePersonalBlocks } from "@/lib/needt3/hooks/personal";
import {
  DAY_ORDER,
  dayName,
  daysText,
  lengthChoices,
  lengthText,
  startChoices,
  usePersonalDefaultRows,
} from "@/lib/needt3/hooks/personal-defaults";

import { useMark } from "./SettingsContext";
import { SGroup, SRow, SSelect, V3Switch } from "./kit";

const pairs = (list: readonly string[]) => list.map((t) => [t, t] as const);

/**
 * Settings → Your day → Personal time. Lunch, a break, a walk: set once, and
 * they repeat. Each is a block of the person's own (see PersonalBlock); the
 * scheduler leaves them alone and nothing is written to Google or iCloud.
 */
export function PersonalDefaults() {
  const mark = useMark();
  const rows = usePersonalDefaultRows(mark);
  const loaded = usePersonalBlocks().data !== undefined;
  return (
    <SGroup
      title="Personal time"
      hint="Time you keep for yourself. Needt never plans a task in it, and it stays in Needt."
    >
      {rows.flatMap((row) => {
        const { preset } = row;
        const name = `${preset.emoji} ${preset.title}`;
        const head = (
          <SRow
            key={preset.kind}
            title={name}
            desc={
              row.on
                ? `${daysText(row.days)} · ${row.at} · ${lengthText(row.minutes)}`
                : "Not kept"
            }
          >
            <V3Switch
              label={`Keep ${preset.title.toLowerCase()} time`}
              checked={row.on}
              disabled={!loaded}
              onChange={(on) => row.save({ enabled: on })}
            />
          </SRow>
        );
        if (!row.on) return [head];
        return [
          head,
          <SRow key={`${preset.kind}-at`} title={`${preset.title} starts`}>
            <SSelect
              label={`${preset.title} starts`}
              width={78}
              value={row.at}
              options={pairs(startChoices(row.at))}
              onChange={(at) => row.save({ at })}
            />
          </SRow>,
          <SRow key={`${preset.kind}-len`} title={`${preset.title} lasts`}>
            <SSelect
              label={`${preset.title} lasts`}
              width={104}
              value={String(row.minutes)}
              options={lengthChoices(row.minutes).map(
                (m) => [String(m), lengthText(m)] as const
              )}
              onChange={(m) => row.save({ minutes: Number(m) })}
            />
          </SRow>,
          <SRow key={`${preset.kind}-days`} title={`${preset.title} on`}>
            <span className="pb-default-days">
              {DAY_ORDER.map((day) => {
                const on = row.days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    className="pb-default-day"
                    aria-pressed={on}
                    aria-label={`${preset.title} on ${dayName(day)}`}
                    title={dayName(day)}
                    onClick={() => {
                      const next = on
                        ? row.days.filter((d) => d !== day)
                        : [...row.days, day];
                      // at least one day: an empty repeat is the switch off
                      if (next.length) row.save({ days: next });
                    }}
                  >
                    {dayName(day).slice(0, 1)}
                  </button>
                );
              })}
            </span>
          </SRow>,
        ];
      })}
    </SGroup>
  );
}
