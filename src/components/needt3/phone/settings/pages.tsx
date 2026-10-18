"use client";

import { useRef, useState } from "react";

import { LuDownload } from "react-icons/lu";

import { currentBuildLabel } from "@/lib/build-info";
import { useAlerts, useUpdateAlerts } from "@/lib/needt3/hooks/account";
import { sendJson } from "@/lib/needt3/hooks/core";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useSetPref, useSettings } from "@/lib/needt3/hooks/settings";
import { notify } from "@/lib/notifications";

import { CityField } from "../../settings/CityField";
import { useMark } from "../../settings/SettingsContext";
import {
  HOUR_OPTIONS,
  type PrefKey,
  minutes,
  readPref,
} from "../../settings/derive";
import { KEY_GROUPS, SHELL_SHORTCUTS } from "../../shell/keys";
import { PkButton } from "../kit";
import { LINK_OPTIONS, SOUND_OPTIONS } from "./model";
import { PsGroup, PsPick, PsRow, PsSwitch } from "./parts";

const noop = () => undefined;

/* Each page below is the desktop section of the same name, drawn for the
   phone; the keys and defaults come from the same helpers and every write is
   `useSetPref`, which merges into the loaded prefs map only and refuses
   (resolves null) before it has loaded. */

/** A switch or a picker bound to one `UserSettings.prefs` key. */
function usePrefs() {
  const settings = useSettings();
  const setPref = useSetPref();
  const mark = useMark();
  const prefs = settings.data?.prefs;
  return {
    get: <K extends PrefKey>(key: K) => readPref(prefs, key),
    set: (key: PrefKey, value: unknown) =>
      void setPref(key, value)
        .then((saved) => saved && mark())
        .catch(noop),
    /** Controls stay off until the stored prefs are known. */
    off: !settings.data,
  };
}

export function GeneralPage() {
  const p = usePrefs();
  return (
    <>
      <PsGroup title="Links">
        <PsPick
          title="Open document links in"
          desc="Whether needt.app links open in the browser or the app."
          value={p.get("links")}
          options={LINK_OPTIONS}
          disabled={p.off}
          onChange={(v) => p.set("links", v)}
        />
      </PsGroup>
      <PsGroup
        title="Weather"
        hint="Shows the weather on Home. Only the city name is sent, never your location."
      >
        <PsRow
          title="City"
          control={
            <CityField
              value={p.get("city")}
              disabled={p.off}
              onSave={(v) => p.set("city", v)}
              width={150}
            />
          }
        />
      </PsGroup>
      <PsGroup title="Offline">
        <PsRow
          title="Offline mode"
          desc="View and edit documents and tasks while offline. Changes sync when you are back."
          control={
            <PsSwitch
              label="Offline mode"
              on={p.get("offline")}
              disabled={p.off}
              onChange={(v) => p.set("offline", v)}
            />
          }
        />
      </PsGroup>
    </>
  );
}

export function TasksPage() {
  const p = usePrefs();
  const projects = useProjects();
  const list = (projects.data ?? []).filter((x) => !x.archived);
  return (
    <>
      <PsGroup title="New tasks">
        <PsPick
          title="Default estimate"
          value={p.get("est")}
          options={minutes([15, 30, 45, 60, 90])}
          disabled={p.off}
          onChange={(v) => p.set("est", v)}
        />
        <PsPick
          title="Default project"
          value={p.get("project")}
          options={[
            ["none", "No project"],
            ...list.map((x) => [x.id, x.name] as const),
          ]}
          disabled={p.off}
          onChange={(v) => p.set("project", v)}
        />
      </PsGroup>
      <PsGroup title="Display">
        <PsRow
          title="Show subtasks"
          desc="Subtasks show as rows under their task, not folded away."
          control={
            <PsSwitch
              label="Show subtasks"
              on={p.get("parts")}
              disabled={p.off}
              onChange={(v) => p.set("parts", v)}
            />
          }
        />
        <PsRow
          title="Task value"
          desc="Shows what a group of tasks earns you once all of them are done."
          control={
            <PsSwitch
              label="Task value"
              on={p.get("money")}
              disabled={p.off}
              onChange={(v) => p.set("money", v)}
            />
          }
        />
      </PsGroup>
    </>
  );
}

/**
 * //todo: "Glow at the edges" (the prototype's `aura`) has no preference key
 * on the desktop either, so it is not drawn.
 */
export function FocusPage() {
  const p = usePrefs();
  return (
    <>
      <PsGroup title="Session">
        <PsPick
          title="Length"
          value={p.get("len")}
          options={minutes([25, 50, 90])}
          disabled={p.off}
          onChange={(v) => p.set("len", v)}
        />
        <PsPick
          title="Break"
          value={p.get("brk")}
          options={minutes([5, 10, 15])}
          disabled={p.off}
          onChange={(v) => p.set("brk", v)}
        />
        <PsPick
          title="Start sound"
          value={p.get("sound")}
          options={SOUND_OPTIONS}
          disabled={p.off}
          onChange={(v) => p.set("sound", v)}
        />
      </PsGroup>
      <PsGroup title="While a session runs">
        <PsRow
          title="Hide notifications"
          control={
            <PsSwitch
              label="Hide notifications"
              on={p.get("hideAlerts")}
              disabled={p.off}
              onChange={(v) => p.set("hideAlerts", v)}
            />
          }
        />
        <PsRow
          title="Sound when a task snaps"
          desc="A short click as a dragged task lands on the quarter hour."
          control={
            <PsSwitch
              label="Sound when a task snaps"
              on={p.get("snapSound")}
              disabled={p.off}
              onChange={(v) => p.set("snapSound", v)}
            />
          }
        />
        {/* Stored as stopMark (true = still); shown the way round people think of it. */}
        <PsRow
          title="Animate the logo"
          desc="The Needt logo moves gently during a session. Off keeps it still."
          control={
            <PsSwitch
              label="Animate the logo"
              on={!p.get("stopMark")}
              disabled={p.off}
              onChange={(on) => p.set("stopMark", !on)}
            />
          }
        />
      </PsGroup>
    </>
  );
}

/**
 * Notifications. The switches are the columns the worker reads
 * (`NotificationSettings`); they stay off until those have loaded, so a
 * switch never shows a default and then flips a different stored value.
 * //todo: the prototype's master "Notifications on this phone" switch has no
 * column behind it, so it is not drawn.
 */
export function AlertsPage() {
  const mark = useMark();
  const alerts = useAlerts();
  const update = useUpdateAlerts();
  const a = alerts.data;
  const save = (patch: Parameters<typeof update.mutateAsync>[0]) => {
    if (!a) return;
    void update.mutateAsync(patch).then(mark).catch(noop);
  };
  const time = a?.dailyPlanTime ?? "08:30";
  const times = HOUR_OPTIONS.some(([v]) => v === time)
    ? HOUR_OPTIONS
    : [...HOUR_OPTIONS, [time, time] as const].sort((x, y) =>
        x[0].localeCompare(y[0])
      );
  return (
    <>
      <PsGroup
        title="Daily plan"
        hint="Your day's planned tasks and events, sent before the day starts."
      >
        <PsRow
          title="Notification"
          control={
            <PsSwitch
              label="Daily plan notification"
              on={a?.dailyPlan ?? true}
              disabled={!a}
              onChange={(v) => save({ dailyPlan: v })}
            />
          }
        />
        <PsRow
          title="Email"
          control={
            <PsSwitch
              label="Daily plan email"
              on={a?.mailPlan ?? false}
              disabled={!a}
              onChange={(v) => save({ mailPlan: v })}
            />
          }
        />
        <PsPick
          title="Time"
          value={time}
          options={times}
          disabled={!a}
          onChange={(v) => save({ dailyPlanTime: v })}
        />
      </PsGroup>
      <PsGroup
        title="Overdue tasks"
        hint="When a task passes its deadline and has no time yet."
      >
        <PsRow
          title="Notification"
          control={
            <PsSwitch
              label="Overdue notification"
              on={a?.nudges ?? false}
              disabled={!a}
              onChange={(v) => save({ nudges: v })}
            />
          }
        />
      </PsGroup>
      <PsGroup
        title="Weekly review"
        hint="Friday, after your last planned task — what got done and what carries over."
      >
        <PsRow
          title="Notification"
          control={
            <PsSwitch
              label="Weekly review notification"
              on={a?.weeklyReview ?? true}
              disabled={!a}
              onChange={(v) => save({ weeklyReview: v })}
            />
          }
        />
      </PsGroup>
    </>
  );
}

/**
 * Data & privacy. Export tasks and the full export use the routes the desktop
 * uses (Tasks as CSV or JSON). //todo: Documents as Markdown, Import and
 * "Download everything again" have nothing behind them on the desktop either.
 */
export function DataPage() {
  const mark = useMark();
  const settings = useSettings();
  const setPref = useSetPref();
  const [busy, setBusy] = useState(false);
  const going = useRef(false);

  const requestAll = async () => {
    if (going.current) return;
    going.current = true;
    setBusy(true);
    try {
      await sendJson("/api/account/export", "POST");
      notify.success("Export requested. We will email you a download link.");
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Could not start the export."
      );
    } finally {
      going.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <PsGroup
        title="Export"
        hint="Everything you have in Needt is yours to take with you."
      >
        <PsRow
          title="Tasks"
          desc="Every task with its project, estimate and dates."
          control={
            <>
              <a
                className="pk-btn is-chip"
                href="/api/export/tasks?includeCompleted=true&format=csv"
                download="needt-tasks.csv"
                data-ps-export-csv=""
              >
                <LuDownload size={14} aria-hidden />
                <span className="pk-btn-cut">CSV</span>
              </a>
              <a
                className="pk-btn is-chip"
                href="/api/export/tasks?includeCompleted=true"
                download="needt-tasks.json"
              >
                <LuDownload size={14} aria-hidden />
                <span className="pk-btn-cut">JSON</span>
              </a>
            </>
          }
        />
        <PsRow
          title="Export all"
          desc="Tasks, documents, habits, boards and settings in one file, sent by email."
          control={
            <PkButton
              kind="chip"
              icon={<LuDownload size={14} aria-hidden />}
              disabled={busy}
              onClick={() => void requestAll()}
              data-ps-export-all=""
            >
              Email me
            </PkButton>
          }
        />
      </PsGroup>
      <PsGroup title="Privacy">
        <PsRow
          title="Share usage data"
          desc="Anonymous counts of which features get used. Never the content of your tasks, documents or mail."
          control={
            <PsSwitch
              label="Share usage data"
              on={readPref(settings.data?.prefs, "usage")}
              disabled={!settings.data}
              onChange={(v) =>
                void setPref("usage", v)
                  .then((saved) => saved && mark())
                  .catch(noop)
              }
            />
          }
        />
      </PsGroup>
    </>
  );
}

/** The same table the key handler and the keyboard sheet read (shell/keys.ts). */
export function KeysPage() {
  return (
    <>
      {KEY_GROUPS.map((group) => (
        <PsGroup key={group} title={group}>
          {SHELL_SHORTCUTS.filter((s) => s.group === group).map((s) => (
            <PsRow
              key={s.label}
              title={s.label}
              value={
                <span className="ps-keys">
                  {s.keys.map((k, i) => (
                    <span key={i} className="ps-kbd">
                      {k}
                    </span>
                  ))}
                </span>
              }
            />
          ))}
        </PsGroup>
      ))}
    </>
  );
}

/**
 * The build is the SHA baked in at release (`lib/build-info`).
 * //todo: What's new and the Help centre (no URL yet) are missing on the
 * desktop too.
 */
export function AboutPage() {
  return (
    <PsGroup>
      <PsRow title="Version" value={currentBuildLabel()} />
      <PsRow title="Terms" out onOpen={() => window.open("/terms", "_blank")} />
      <PsRow
        title="Privacy"
        out
        onOpen={() => window.open("/privacy", "_blank")}
      />
      <PsRow
        title="Subprocessors"
        out
        onOpen={() => window.open("/subprocessors", "_blank")}
      />
    </PsGroup>
  );
}
