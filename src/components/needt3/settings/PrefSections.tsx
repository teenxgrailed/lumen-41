"use client";

import { useProjects } from "@/lib/needt3/hooks/projects";
import { useSetPref, useSettings } from "@/lib/needt3/hooks/settings";

import { useMark } from "./SettingsContext";
import { type PrefKey, minutes, readPref } from "./derive";
import { SGroup, SRow, SSelect, V3Switch } from "./kit";

/** A switch and a select bound to one `UserSettings.prefs` key. */
function usePrefs() {
  const settings = useSettings();
  const setPref = useSetPref();
  const mark = useMark();
  const prefs = settings.data?.prefs;
  return {
    get: <K extends PrefKey>(key: K) => readPref(prefs, key),
    set: (key: PrefKey, value: unknown) =>
      void setPref(key, value).then((saved) => saved && mark()),
    /** Controls stay off until the stored prefs are known. */
    off: !settings.data,
  };
}

export function GeneralSection() {
  const p = usePrefs();
  return (
    <>
      <SGroup title="Links">
        <SRow
          title="Open document links in"
          desc="Whether needt.app links open in the browser or the desktop app."
        >
          <SSelect
            label="Open document links in"
            value={p.get("links")}
            options={[
              ["ask", "Always ask"],
              ["web", "Browser"],
              ["app", "Desktop app"],
            ]}
            disabled={p.off}
            onChange={(v) => p.set("links", v)}
          />
        </SRow>
      </SGroup>
      <SGroup title="Offline">
        <SRow
          title="Offline mode"
          desc="View and edit documents and tasks while offline. Changes sync when you are back."
        >
          <V3Switch
            label="Offline mode"
            checked={p.get("offline")}
            disabled={p.off}
            onChange={(v) => p.set("offline", v)}
          />
        </SRow>
      </SGroup>
    </>
  );
}

export function TasksSection() {
  const p = usePrefs();
  const projects = useProjects();
  const list = (projects.data ?? []).filter((x) => !x.archived);
  return (
    <>
      <SGroup title="New tasks">
        <SRow title="Default estimate">
          <SSelect
            label="Default estimate"
            width={110}
            value={p.get("est")}
            options={minutes([15, 30, 45, 60, 90])}
            disabled={p.off}
            onChange={(v) => p.set("est", v)}
          />
        </SRow>
        <SRow title="Default project">
          <SSelect
            label="Default project"
            width={160}
            value={p.get("project")}
            options={[
              ["none", "No project"],
              ...list.map((x) => [x.id, x.name] as const),
            ]}
            disabled={p.off}
            onChange={(v) => p.set("project", v)}
          />
        </SRow>
      </SGroup>
      <SGroup title="Display">
        <SRow
          title="Show subtasks"
          desc="Subtasks show as rows under their task, not folded away."
        >
          <V3Switch
            label="Show subtasks"
            checked={p.get("parts")}
            disabled={p.off}
            onChange={(v) => p.set("parts", v)}
          />
        </SRow>
        <SRow
          title="Task value"
          desc="Shows what a group of tasks earns you once all of them are done, e.g. CHF 840."
        >
          <V3Switch
            label="Task value"
            checked={p.get("money")}
            disabled={p.off}
            onChange={(v) => p.set("money", v)}
          />
        </SRow>
        {/* //todo: Project activity (the flame) has no rule behind it yet
            (01-data-map §4 "heat"), so the row is not shown. */}
      </SGroup>
    </>
  );
}

export function FocusSection() {
  const p = usePrefs();
  return (
    <>
      <SGroup title="Session">
        <SRow title="Length">
          <SSelect
            label="Length"
            width={110}
            value={p.get("len")}
            options={minutes([25, 50, 90])}
            disabled={p.off}
            onChange={(v) => p.set("len", v)}
          />
        </SRow>
        <SRow title="Break">
          <SSelect
            label="Break"
            width={110}
            value={p.get("brk")}
            options={minutes([5, 10, 15])}
            disabled={p.off}
            onChange={(v) => p.set("brk", v)}
          />
        </SRow>
        <SRow title="Start sound">
          <SSelect
            label="Start sound"
            value={p.get("sound")}
            options={[
              ["none", "Silent"],
              ["tick", "Tick"],
              ["chime", "Chime"],
            ]}
            disabled={p.off}
            onChange={(v) => p.set("sound", v)}
          />
        </SRow>
      </SGroup>
      <SGroup title="While a session runs">
        <SRow title="Hide notifications">
          <V3Switch
            label="Hide notifications"
            checked={p.get("hideAlerts")}
            disabled={p.off}
            onChange={(v) => p.set("hideAlerts", v)}
          />
        </SRow>
        <SRow
          title="Sound when a task snaps"
          desc="A short click as a dragged task lands on the quarter hour."
        >
          <V3Switch
            label="Sound when a task snaps"
            checked={p.get("snapSound")}
            disabled={p.off}
            onChange={(v) => p.set("snapSound", v)}
          />
        </SRow>
        {/* Stored as stopMark (true = still); shown the way round people think of it. */}
        <SRow
          title="Animate the logo"
          desc="The Needt logo moves gently during a session. Off keeps it still."
        >
          <V3Switch
            label="Animate the logo"
            checked={!p.get("stopMark")}
            disabled={p.off}
            onChange={(on) => p.set("stopMark", !on)}
          />
        </SRow>
      </SGroup>
    </>
  );
}
