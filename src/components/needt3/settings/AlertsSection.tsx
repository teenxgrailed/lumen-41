"use client";

import { isMacApp } from "@/lib/desktop";
import { useAlerts, useUpdateAlerts } from "@/lib/needt3/hooks/account";

import { PushGroup } from "./PushGroup";
import { useMark } from "./SettingsContext";
import { SGroup, SRow, SSelect, V3Switch } from "./kit";

const HOURS: readonly (readonly [string, string])[] = Array.from(
  { length: 24 },
  (_, h) => {
    const v = `${String(h).padStart(2, "0")}:00`;
    return [v, v] as const;
  }
);

/**
 * Notifications. Every switch is a `NotificationSettings` column the server
 * reads before it sends anything (src/services/notifications/preferences.ts):
 * the bell always keeps the record, these decide what also interrupts.
 */
export function AlertsSection() {
  const mark = useMark();
  const alerts = useAlerts();
  const update = useUpdateAlerts();
  const a = alerts.data;
  const save = (patch: Parameters<typeof update.mutateAsync>[0]) =>
    void update.mutateAsync(patch).then(mark);
  const toggle = (
    title: string,
    key:
      | "reminders"
      | "nudges"
      | "mentions"
      | "weeklyReview"
      | "system"
      | "focusEnded"
      | "channelInApp"
      | "channelPush"
      | "channelMac"
      | "emailNotifications",
    desc?: string
  ) => (
    <SRow title={title} desc={desc}>
      <V3Switch
        label={title}
        checked={a?.[key] ?? false}
        onChange={(v) => save({ [key]: v })}
      />
    </SRow>
  );
  return (
    <>
      <PushGroup />
      <SGroup title="Notify me about">
        {toggle("Reminders", "reminders")}
        {toggle("Overdue tasks", "nudges")}
        {toggle("Mentions and shares", "mentions")}
        {toggle("Weekly check-ins", "weeklyReview")}
        {toggle("Focus ended", "focusEnded")}
        {toggle("System", "system", "Sync problems and finished imports.")}
      </SGroup>
      <SGroup
        title="Where"
        hint="The bell always keeps everything; these decide what also reaches you."
      >
        {toggle("In the app", "channelInApp")}
        {toggle("Push", "channelPush")}
        {isMacApp() ? toggle("Mac notifications", "channelMac") : null}
        {toggle("Email", "emailNotifications")}
      </SGroup>
      <SGroup
        title="Quiet hours"
        hint="Nothing interrupts; it waits in the bell."
      >
        <SRow title="Hold notifications">
          <V3Switch
            label="Hold notifications"
            checked={a?.quietHours ?? false}
            onChange={(v) => save({ quietHours: v })}
          />
        </SRow>
        {a?.quietHours ? (
          <>
            <SRow title="From">
              <SSelect
                label="Quiet from"
                value={a.quietStart}
                options={HOURS}
                width={100}
                onChange={(v) => save({ quietStart: v })}
              />
            </SRow>
            <SRow title="Until">
              <SSelect
                label="Quiet until"
                value={a.quietEnd}
                options={HOURS}
                width={100}
                onChange={(v) => save({ quietEnd: v })}
              />
            </SRow>
          </>
        ) : null}
      </SGroup>
      <SGroup
        title="Daily digest"
        hint="One morning summary instead of a stream."
      >
        <SRow title="Daily digest instead of a stream">
          <V3Switch
            label="Daily digest instead of a stream"
            checked={a?.digest ?? false}
            onChange={(v) => save({ digest: v })}
          />
        </SRow>
        {a?.digest ? (
          <SRow title="Send at">
            <SSelect
              label="Digest time"
              value={a.digestTime}
              options={HOURS}
              width={100}
              onChange={(v) => save({ digestTime: v })}
            />
          </SRow>
        ) : null}
      </SGroup>
    </>
  );
}
