"use client";

import { NeedtPicker } from "@/components/ui/needt-picker";

import { WeekHoursRows } from "../settings/WeekHoursRows";
import { SGroup, SRow } from "../settings/kit";
import type { Onboarding } from "./useOnboarding";

/**
 * The hours step, the same on desktop and phone: Settings' per-day editor
 * (a switch per day, a lunch break, "Copy to weekdays"), prefilled Mon-Fri
 * 9-17 by the schedule's own defaults, then the time zone. Edits are saved as
 * they are made, by the editor, never before the schedule has loaded.
 */
export function HoursStep({ ob }: { ob: Onboarding }) {
  const { week, weekReady, saveWeek, tz, setTz, zoneOptions } = ob;
  return (
    <div className="auth-ob-weekrows" data-ob-hours="">
      <SGroup>
        <WeekHoursRows week={week} disabled={!weekReady} onChange={saveWeek} />
        <SRow title="Time zone">
          <span className="auth-select is-wide">
            <NeedtPicker
              value={tz || zoneOptions[0][0]}
              options={zoneOptions.map(([value, label]) => ({ value, label }))}
              onValueChange={setTz}
              ariaLabel="Time zone"
              triggerVariant="field"
            />
          </span>
        </SRow>
      </SGroup>
    </div>
  );
}
