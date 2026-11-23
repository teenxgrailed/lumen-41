"use client";

import { BUDGET_SIDEBAR_PREF } from "@/lib/needt3/budget";
import { type CityPlace, parseCityPlace } from "@/lib/needt3/city";
import { useBudgetNav } from "@/lib/needt3/hooks/budget";
import { useNavPins, useRankedPlaces } from "@/lib/needt3/hooks/nav-rank";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { useProjects } from "@/lib/needt3/hooks/projects";
import {
  EASY_START_HELP,
  EASY_START_MODES,
  IDEA_CARDS_HELP,
  useEasyStart,
  useIdeaCardsSwitch,
  useSetPref,
  useSetPrefs,
  useSettings,
} from "@/lib/needt3/hooks/settings";
import { isPro } from "@/lib/needt3/paywall";

import { ProBadge } from "../paywall";
import { PLACES, placeById } from "../shell/places";
import { CityField } from "./CityField";
import { useMark } from "./SettingsContext";
import { type PrefKey, minutes, readPref } from "./derive";
import { SGroup, SRow, SSelect, V3Switch } from "./kit";

/** A switch and a select bound to one `UserSettings.prefs` key. */
export function usePrefs() {
  const settings = useSettings();
  const setPref = useSetPref();
  const setPrefs = useSetPrefs();
  const mark = useMark();
  const prefs = settings.data?.prefs;
  return {
    get: <K extends PrefKey>(key: K) => readPref(prefs, key),
    set: (key: PrefKey, value: unknown) =>
      void setPref(key, value).then((saved) => saved && mark()),
    place: parseCityPlace(prefs?.cityPlace),
    /** The picked city: its name and its place land in one write. */
    setCity: (place: CityPlace | null) =>
      void setPrefs({ city: place ? place.name : "", cityPlace: place }).then(
        (saved) => saved && mark()
      ),
    /** Controls stay off until the stored prefs are known. */
    off: !settings.data,
  };
}

export function GeneralSection() {
  const p = usePrefs();
  return (
    <>
      <PinnedGroup />
      <BudgetGroup p={p} />
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
      <SGroup title="Weather">
        <SRow
          title="City"
          desc="Shows the weather on Home. Only what you type is sent, never your location."
        >
          <CityField
            city={p.get("city")}
            place={p.place}
            disabled={p.off}
            onPick={p.setCity}
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

/**
 * Pinned places. The sidebar and the menu arrange themselves by use: the
 * sidebar's places in the order in use; a pinned one
 * keeps its spot when the weekly ranking moves the others.
 */
function PinnedGroup() {
  const mark = useMark();
  const ranked = useRankedPlaces();
  const pins = useNavPins();
  const ids = ranked.filter((id) => PLACES.some((p) => p.id === id));
  return (
    <SGroup
      title="Pinned"
      hint="The sidebar follows what you open most, once a week. A pinned place stays where it is."
    >
      {ids.map((id) => {
        const place = placeById(id);
        if (!place) return null;
        return (
          <SRow key={id} title={place.label}>
            <V3Switch
              label={`Pin ${place.label}`}
              checked={pins.pinned.includes(id)}
              disabled={!pins.ready}
              onChange={() =>
                void pins.toggle(id).then((saved) => saved && mark())
              }
            />
          </SRow>
        );
      })}
    </SGroup>
  );
}

/**
 * Needt Budget in the sidebar, while its place exists for the person. Pro can
 * hide it; on Free the place stays (it is how Budget is found), so the switch
 * is on and locked.
 */
function BudgetGroup({ p }: { p: ReturnType<typeof usePrefs> }) {
  const nav = useBudgetNav();
  const plan = usePlan();
  if (!nav.enabled || !plan.data) return null;
  const pro = isPro(plan.data.kind);
  return (
    <SGroup title="Sidebar">
      <SRow
        title={
          <>
            Needt Budget{" "}
            {pro ? null : <ProBadge size="sm" locked feature="Needt Budget" />}
          </>
        }
        desc={
          pro
            ? "Show Budget in the sidebar and the menu."
            : "Budget stays in the sidebar on Free. With Pro you can hide it."
        }
      >
        <V3Switch
          label="Show Needt Budget in the sidebar"
          checked={pro ? p.get(BUDGET_SIDEBAR_PREF) : true}
          disabled={p.off || !pro}
          onChange={(v) => p.set(BUDGET_SIDEBAR_PREF, v)}
        />
      </SRow>
    </SGroup>
  );
}

function EasyStartRows({
  projects,
}: {
  projects: readonly { id: string; name: string }[];
}) {
  const easy = useEasyStart();
  const mark = useMark();
  const skipped = projects.filter((x) => easy.excluded.includes(x.id)).length;
  return (
    <>
      <SRow title="Always easy start" desc={EASY_START_HELP}>
        <SSelect
          label="Always easy start"
          width={130}
          value={easy.mode}
          options={EASY_START_MODES}
          disabled={!easy.loaded}
          onChange={(v) =>
            void easy
              .setMode(v as (typeof EASY_START_MODES)[number][0])
              .then(mark, () => undefined)
          }
        />
      </SRow>
      <SRow
        title="Keep out of easy start"
        desc="Tasks in a project you pick here are never changed. Pick a project again to bring it back."
      >
        <SSelect
          label="Keep out of easy start"
          width={160}
          value={skipped ? `${skipped} selected` : "None"}
          options={projects.map(
            (x) =>
              [
                x.id,
                `${easy.excluded.includes(x.id) ? "✓ " : ""}${x.name}`,
              ] as const
          )}
          disabled={
            !easy.loaded || projects.length === 0 || easy.mode === "off"
          }
          onChange={(id) =>
            void easy.toggleExcluded(id).then(mark, () => undefined)
          }
        />
      </SRow>
    </>
  );
}

function IdeaCardsRow() {
  const ideas = useIdeaCardsSwitch();
  const mark = useMark();
  return (
    <SRow title="Idea cards" desc={IDEA_CARDS_HELP}>
      <V3Switch
        label="Idea cards"
        checked={ideas.on}
        disabled={ideas.disabled}
        onChange={(v) => void ideas.set(v).then((saved) => saved && mark())}
      />
    </SRow>
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
        <EasyStartRows projects={list} />
        <IdeaCardsRow />
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
