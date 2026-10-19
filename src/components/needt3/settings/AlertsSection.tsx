"use client";

import { useAlerts, useUpdateAlerts } from "@/lib/needt3/hooks/account";

import { useMark } from "./SettingsContext";
import { PushGroup } from "./PushGroup";
import { SGroup, SRow, V3Switch } from "./kit";

/**
 * Notifications. The switches are the columns the worker reads
 * (`NotificationSettings.nudges`, `focusEnded`). Daily plan and Weekly review
 * have no sender and are not offered; their columns stay.
 */
export function AlertsSection() {
  const mark = useMark();
  const alerts = useAlerts();
  const update = useUpdateAlerts();
  const a = alerts.data;
  const save = (patch: Parameters<typeof update.mutateAsync>[0]) =>
    void update.mutateAsync(patch).then(mark);
  return (
    <>
      <PushGroup />
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
        title="Focus"
        hint="When a Focus session reaches its planned end. Sent as a push, and shown here if Needt is open."
      >
        <SRow title="Focus ended">
          <V3Switch
            label="Focus ended notification"
            checked={a?.focusEnded ?? true}
            onChange={(v) => save({ focusEnded: v })}
          />
        </SRow>
      </SGroup>
    </>
  );
}
