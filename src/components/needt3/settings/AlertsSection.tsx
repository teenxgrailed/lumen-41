"use client";

import { useAlerts, useUpdateAlerts } from "@/lib/needt3/hooks/account";

import { useMark } from "./SettingsContext";
import { HOUR_OPTIONS } from "./derive";
import { SGroup, SRow, SSelect, V3Switch } from "./kit";

/**
 * Notifications. The switches are the columns the worker reads
 * (`NotificationSettings.dailyPlan`, `dailyPlanTime`, `mailPlan`, `nudges`,
 * `weeklyReview`).
 */
export function AlertsSection() {
  const mark = useMark();
  const alerts = useAlerts();
  const update = useUpdateAlerts();
  const a = alerts.data;
  const save = (patch: Parameters<typeof update.mutateAsync>[0]) =>
    void update.mutateAsync(patch).then(mark);
  const time = a?.dailyPlanTime ?? "08:30";
  const times = HOUR_OPTIONS.some(([v]) => v === time)
    ? HOUR_OPTIONS
    : [...HOUR_OPTIONS, [time, time] as const].sort((x, y) =>
        x[0].localeCompare(y[0])
      );
  return (
    <>
      <SGroup
        title="Daily plan"
        hint="Your day's planned tasks and events, sent before the day starts."
      >
        <SRow title="Desktop notification">
          <V3Switch
            label="Daily plan notification"
            checked={a?.dailyPlan ?? true}
            onChange={(v) => save({ dailyPlan: v })}
          />
        </SRow>
        <SRow title="Email">
          <V3Switch
            label="Daily plan email"
            checked={a?.mailPlan ?? false}
            onChange={(v) => save({ mailPlan: v })}
          />
        </SRow>
        <SRow title="Time">
          <SSelect
            label="Daily plan time"
            width={110}
            value={time}
            options={times}
            onChange={(v) => save({ dailyPlanTime: v })}
          />
        </SRow>
      </SGroup>
      <SGroup
        title="Overdue tasks"
        hint="When a task passes its deadline and has no time yet."
      >
        <SRow title="Desktop notification">
          <V3Switch
            label="Overdue notification"
            checked={a?.nudges ?? false}
            onChange={(v) => save({ nudges: v })}
          />
        </SRow>
      </SGroup>
      <SGroup
        title="Weekly review"
        hint="Friday, after your last planned task — what got done and what carries over."
      >
        <SRow title="Desktop notification">
          <V3Switch
            label="Weekly review notification"
            checked={a?.weeklyReview ?? true}
            onChange={(v) => save({ weeklyReview: v })}
          />
        </SRow>
      </SGroup>
    </>
  );
}
