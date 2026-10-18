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

import { useMark } from "../../settings/SettingsContext";
import { PsGroup, PsPick, PsRow, PsSwitch } from "./parts";

const pairs = (list: readonly string[]) => list.map((t) => [t, t] as const);

/** Personal time on the phone: the same defaults as the desktop, same rules. */
export function PhonePersonalDefaults() {
  const mark = useMark();
  const rows = usePersonalDefaultRows(mark);
  const loaded = usePersonalBlocks().data !== undefined;
  return (
    <PsGroup
      title="Personal time"
      hint="Time you keep for yourself. Needt never plans a task in it, and it stays in Needt."
    >
      {rows.flatMap((row) => {
        const { preset } = row;
        const head = (
          <PsRow
            key={preset.kind}
            title={`${preset.emoji} ${preset.title}`}
            desc={
              row.on
                ? `${daysText(row.days)} · ${row.at} · ${lengthText(row.minutes)}`
                : "Not kept"
            }
            control={
              <PsSwitch
                label={`Keep ${preset.title.toLowerCase()} time`}
                on={row.on}
                disabled={!loaded}
                onChange={(on) => row.save({ enabled: on })}
              />
            }
          />
        );
        if (!row.on) return [head];
        return [
          head,
          <PsPick
            key={`${preset.kind}-at`}
            title={`${preset.title} starts`}
            value={row.at}
            options={pairs(startChoices(row.at))}
            onChange={(at) => row.save({ at })}
          />,
          <PsPick
            key={`${preset.kind}-len`}
            title={`${preset.title} lasts`}
            value={String(row.minutes)}
            options={lengthChoices(row.minutes).map(
              (m) => [String(m), lengthText(m)] as const
            )}
            onChange={(m) => row.save({ minutes: Number(m) })}
          />,
          <PsRow
            key={`${preset.kind}-days`}
            title={`${preset.title} on`}
            control={
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
                      onClick={() => {
                        const next = on
                          ? row.days.filter((d) => d !== day)
                          : [...row.days, day];
                        if (next.length) row.save({ days: next });
                      }}
                    >
                      {dayName(day).slice(0, 1)}
                    </button>
                  );
                })}
              </span>
            }
          />,
        ];
      })}
    </PsGroup>
  );
}
