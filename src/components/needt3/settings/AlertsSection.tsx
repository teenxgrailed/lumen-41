"use client";

import { isMacApp } from "@/lib/desktop";
import { checkinTimeOptions } from "@/lib/needt3/habit-presence";
import { useAlerts, useUpdateAlerts } from "@/lib/needt3/hooks/account";
import { useHabits, useUpdateHabit } from "@/lib/needt3/hooks/habits";
import { useFreshQuitGate } from "@/lib/needt3/hooks/habits-quit";

import { EmailGroup } from "./EmailGroup";
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
        {a?.digest
          ? toggle(
              "Also email the digest",
              "emailNotifications",
              "Tasks and reminders never send email; only this summary does."
            )
          : null}
      </SGroup>
      <HabitsGroup />
      <EmailGroup />
    </>
  );
}

/**
 * Settings → Notifications → Habits (HANDOFF §5): the reminder at each
 * habit's time, the evening check-in, Quit milestones and "Been a while"
 * (off unless turned on). Behind `habits_quit`.
 */
function HabitsGroup() {
  const mark = useMark();
  const gate = useFreshQuitGate();
  const alerts = useAlerts();
  const update = useUpdateAlerts();
  const habits = useHabits().data ?? [];
  const updateHabit = useUpdateHabit();
  const a = alerts.data;
  if (gate === "off" || !a) return null;
  const save = (patch: Parameters<typeof update.mutateAsync>[0]) =>
    void update.mutateAsync(patch).then(mark);
  const live = habits.filter((h) => !h.archivedAt);
  return (
    <>
      <SGroup
        title="Habits"
        hint="A pull you log in quiet hours still works — only Needt stays quiet."
      >
        <SRow
          title="Reminders"
          desc="At each habit's own time; none once it is done."
        >
          <V3Switch
            label="Habit reminders"
            checked={a.habitReminders}
            onChange={(v) => save({ habitReminders: v })}
          />
        </SRow>
        <SRow
          title="Check-in"
          desc="Once a day; skipped when everything is marked."
        >
          <V3Switch
            label="Evening check-in"
            checked={a.habitCheckin}
            onChange={(v) => save({ habitCheckin: v })}
          />
        </SRow>
        {a.habitCheckin ? (
          <SRow title="Check-in at">
            <SSelect
              label="Check-in time"
              value={a.habitCheckinTime}
              options={checkinTimeOptions(a.habitCheckinTime)}
              width={100}
              onChange={(v) => save({ habitCheckinTime: v })}
            />
          </SRow>
        ) : null}
        <SRow
          title="Milestones"
          desc="Quit habits: 1, 3, 7, 14, 30, 90 and 365 days."
        >
          <V3Switch
            label="Habit milestones"
            checked={a.habitMilestones}
            onChange={(v) => save({ habitMilestones: v })}
          />
        </SRow>
        <SRow
          title="Been a while"
          desc="Once, after a few days away. Never a count of missed days."
        >
          <V3Switch
            label="Been a while"
            checked={a.habitReengage}
            onChange={(v) => save({ habitReengage: v })}
          />
        </SRow>
      </SGroup>
      {live.length ? (
        <SGroup title="Per habit" hint="The reminder at its own time.">
          {live.map((h) => (
            <SRow
              key={h.id}
              title={h.title}
              desc={
                h.kind === "QUIT"
                  ? gate === "on"
                    ? "Quit: its milestones"
                    : "Quit: milestones are Pro"
                  : (h.schedule.time ?? "No time set")
              }
            >
              {h.kind === "QUIT" && gate !== "on" ? null : (
                <V3Switch
                  label={
                    h.kind === "QUIT"
                      ? `Milestones for ${h.title}`
                      : `Reminder for ${h.title}`
                  }
                  checked={h.remindersEnabled !== false}
                  onChange={(v) =>
                    void updateHabit
                      .mutateAsync({ id: h.id, patch: { remindersEnabled: v } })
                      .then(mark)
                  }
                />
              )}
            </SRow>
          ))}
        </SGroup>
      ) : null}
    </>
  );
}
