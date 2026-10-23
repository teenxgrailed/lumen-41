"use client";

/* Settings -> Desktop (additions-2/settings-desktop/desktop.js): the five
   sections of the Desktop group, built from the sheet's own kit. The values are
   stored in `UserSettings.prefs` (keys in DESKTOP_PREF_DEFAULTS); the Mac app
   reads them from there. Outside the Mac app each section is one row that says
   so. Two pieces are new: the live island (IslandPlay, `sd-play`) and the
   widget style tiles (`sd-styles`). */
import { type ReactNode, useEffect, useState } from "react";

import { isMacApp } from "@/lib/desktop";

import { Glyph, type GlyphName } from "../glyphs/Glyph";
import { useIsPro } from "../paywall/Pro";
import { SortableItem, SortableList } from "../sortable/Sortable";
import { useSortableList } from "../sortable/useSortableList";
import { IslandPlay } from "./IslandPlay";
import { usePrefs } from "./PrefSections";
import { DESKTOP_PREF_DEFAULTS, type PrefKey } from "./derive";
import { Kbd, ProPill, SBtn, SGroup, SRow, SSelect, V3Switch } from "./kit";

/** [unverified] the download page and the Mac app's URL scheme. */
const MAC_DOWNLOAD_URL = "https://needt.app/download";
const MAC_APP_URL = "needt://settings";

type Prefs = ReturnType<typeof usePrefs>;
type BoolKey = {
  [K in PrefKey]: (typeof DESKTOP_PREF_DEFAULTS)[Extract<
    K,
    keyof typeof DESKTOP_PREF_DEFAULTS
  >] extends boolean
    ? K
    : never;
}[keyof typeof DESKTOP_PREF_DEFAULTS];

function useMacApp() {
  // Decided after mount: the server render and a browser tab agree.
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(isMacApp()), []);
  return mac;
}

/** Every section outside the Mac app: one row, and the way to the app. */
function Elsewhere() {
  return (
    <SGroup>
      <SRow
        lead={
          <span className="sd-lead">
            <Glyph name="devices" size={18} />
          </span>
        }
        title="These settings live in the Mac app"
        desc="The island, the quick-add hotkey, the menu bar, widgets and Siri & Shortcuts run on your Mac. Open Settings there to change them."
      >
        <a
          className="nx-btn nx-btn-primary nx-btn-sm"
          href={MAC_DOWNLOAD_URL}
          target="_blank"
          rel="noreferrer"
        >
          Get Needt for Mac
        </a>
      </SRow>
      <SRow title="Already installed?" desc="Opens this page in the app.">
        <a className="nx-btn nx-btn-secondary" href={MAC_APP_URL}>
          Open in the app
        </a>
      </SRow>
    </SGroup>
  );
}

function Gate({ children }: { children: ReactNode }) {
  return useMacApp() ? <>{children}</> : <Elsewhere />;
}

function Sw({
  p,
  k,
  label,
  locked,
}: {
  p: Prefs;
  k: BoolKey;
  label: string;
  /** Free: the island is shown, not changeable. */
  locked?: boolean;
}) {
  return (
    <V3Switch
      label={label}
      checked={p.get(k)}
      disabled={p.off || locked}
      onChange={(v) => p.set(k, v)}
    />
  );
}

function Pick<K extends PrefKey>({
  p,
  k,
  label,
  options,
  width = 150,
  locked,
}: {
  p: Prefs;
  k: K;
  label: string;
  options: readonly (readonly [string, string])[];
  width?: number;
  locked?: boolean;
}) {
  return (
    <SSelect
      label={label}
      width={width}
      value={String(p.get(k))}
      options={options}
      disabled={p.off || locked}
      onChange={(v) => p.set(k, v)}
    />
  );
}

const lead = (name: GlyphName) => (
  <span className="sd-lead">
    <Glyph name={name} size={18} />
  </span>
);

/* ---------- App ---------- */

const KEY_NAMES: Record<string, string> = { " ": "Space" };

/** The hotkey as "⌥ Space": modifiers first, then the key. */
function comboOf(e: KeyboardEvent): string | null {
  if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return null;
  if (!(e.ctrlKey || e.altKey || e.metaKey)) return null;
  const mods = [
    e.ctrlKey ? "⌃" : "",
    e.altKey ? "⌥" : "",
    e.shiftKey ? "⇧" : "",
    e.metaKey ? "⌘" : "",
  ].filter(Boolean);
  const key =
    KEY_NAMES[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return [...mods, key].join(" ");
}

function Hotkey({ p }: { p: Prefs }) {
  const [rec, setRec] = useState(false);
  useEffect(() => {
    if (!rec) return undefined;
    const key = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") return setRec(false);
      const combo = comboOf(e);
      if (!combo) return;
      p.set("macQuickAddKeys", combo);
      setRec(false);
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [rec, p]);
  return (
    <>
      {rec ? (
        <span className="settings-kbd-grid">Press the new keys</span>
      ) : (
        p
          .get("macQuickAddKeys")
          .split(" ")
          .map((k) => <Kbd key={k} k={k} />)
      )}
      <SBtn disabled={p.off} onClick={() => setRec((r) => !r)}>
        {rec ? "Cancel" : "Change"}
      </SBtn>
    </>
  );
}

export function AppSection() {
  const p = usePrefs();
  return (
    <Gate>
      <SGroup title="Startup">
        <SRow title="Open Needt at login">
          <Sw p={p} k="macLogin" label="Open Needt at login" />
        </SRow>
        <SRow
          title="Keep running when the window is closed"
          desc="The island, menu bar and hotkey keep working."
        >
          <Sw
            p={p}
            k="macKeepRunning"
            label="Keep running when the window is closed"
          />
        </SRow>
      </SGroup>
      <SGroup title="Quick add">
        <SRow title="Hotkey" desc="Works in any app.">
          <Hotkey p={p} />
        </SRow>
        <SRow
          title="Plan it right away"
          desc="New tasks go straight into free time today."
        >
          <Sw p={p} k="macQuickAddPlan" label="Plan it right away" />
        </SRow>
      </SGroup>
      <SGroup title="Menu bar & Dock">
        <SRow title="Icon in the menu bar">
          <Pick
            p={p}
            k="macMenuIcon"
            label="Icon in the menu bar"
            options={[
              ["focus", "Only during focus"],
              ["always", "Always"],
              ["off", "Hidden"],
            ]}
          />
        </SRow>
        <SRow title="Dock badge">
          <Pick
            p={p}
            k="macDockBadge"
            label="Dock badge"
            options={[
              ["overdue", "Overdue tasks"],
              ["off", "None"],
            ]}
          />
        </SRow>
      </SGroup>
      <SGroup title="Updates">
        <SRow title="Needt for Mac" desc="Updates install themselves.">
          <SBtn
            onClick={() =>
              (
                window as unknown as {
                  __needtNative?: { checkForUpdates?: () => void };
                }
              ).__needtNative?.checkForUpdates?.()
            }
          >
            Check for updates
          </SBtn>
        </SRow>
      </SGroup>
    </Gate>
  );
}

/* ---------- Island ---------- */

const sf = (d: ReactNode) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {d}
  </svg>
);

/** The More modules: id (also the order key), pref, colour, mark, line. */
const MODULES = [
  {
    id: "music",
    pref: "islandMusic",
    name: "Music",
    c: "#ff375f",
    desc: "App Store build: Apple Music and Spotify",
    mark: sf(
      <>
        <path d="M6 12.5V3.5l7-1.5v9" />
        <circle cx="4.5" cy="12.5" r="1.8" />
        <circle cx="11.5" cy="11" r="1.8" />
      </>
    ),
  },
  {
    id: "calendar",
    pref: "islandCalendar",
    name: "Calendar",
    c: "#ff453a",
    desc: "Month and the day's events, all calendars",
    mark: sf(
      <>
        <rect x="2" y="3" width="12" height="11" rx="2.5" />
        <path d="M2 6.5h12M5.5 1.8v2.4M10.5 1.8v2.4" />
      </>
    ),
  },
  {
    id: "shelf",
    pref: "islandShelf",
    name: "Shelf",
    c: "#ff9f0a",
    desc: "Drop files, drag them out, AirDrop",
    mark: sf(
      <>
        <path d="M2 9.5l1.8-6h8.4l1.8 6v3a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5z" />
        <path d="M2 9.5h3.5l1 1.5h3l1-1.5H14" />
      </>
    ),
  },
  {
    id: "clipboard",
    pref: "islandClipboard",
    name: "Clipboard",
    c: "#8e8e93",
    desc: "Last 5 copies · ⌘⇧V",
    mark: sf(
      <>
        <rect x="3" y="2.5" width="10" height="12" rx="2" />
        <path d="M5.5 7h5M5.5 9.5h5M5.5 12h3" />
      </>
    ),
  },
  {
    id: "devices",
    pref: "islandDevices",
    name: "Devices",
    c: "#30d158",
    desc: "Battery of the Mac, AirPods, iPhone",
    mark: sf(
      <>
        <rect x="1.5" y="4.5" width="11.5" height="7" rx="2" />
        <path d="M14.5 7v2" />
      </>
    ),
  },
  {
    id: "tools",
    pref: "islandTools",
    name: "Tools",
    c: "#0a84ff",
    desc: "Timer, mirror, weather",
    mark: sf(
      <path d="M9.5 2.5a3 3 0 0 0 3.9 3.9L7 12.8a1.6 1.6 0 1 1-2.3-2.3L11 4.1" />
    ),
  },
  {
    id: "hud",
    pref: "islandHud",
    name: "Volume & brightness",
    c: "#636366",
    desc: "Replaces the system HUD · direct-download build only",
    mark: sf(
      <>
        <path d="M2.5 6h2.5l3.5-3v10L5 10H2.5z" />
        <path d="M11 5.5a3.5 3.5 0 0 1 0 5" />
      </>
    ),
  },
] as const;

/** The stored order, with any module it lacks added at the end. */
function moduleOrder(raw: string) {
  const ids: string[] = MODULES.map((m) => m.id);
  const seen = raw
    .split(",")
    .filter((id, i, a) => ids.includes(id) && a.indexOf(id) === i);
  return [...seen, ...ids.filter((id) => !seen.includes(id))];
}

function Modules({ p, locked }: { p: Prefs; locked: boolean }) {
  const order = moduleOrder(p.get("islandModuleOrder"));
  const items = order.map((id) => MODULES.find((m) => m.id === id)!);
  const ctl = useSortableList({
    items,
    label: (m) => m.name,
    disabled: p.off || locked,
    onReorder: (next) => p.set("islandModuleOrder", next.join(",")),
  });
  return (
    <SGroup
      title="More ···"
      hint="Drag to reorder. The one that matters right now also gets a chip in the bar — music while it plays. Shelf takes files you drag to the island; Volume answers the scroll wheel."
    >
      <SortableList ctl={ctl}>
        {ctl.ordered.map((m) => (
          <SortableItem key={m.id} id={m.id} label={m.name}>
            {({ handleProps }) => (
              <SRow
                title={m.name}
                desc={m.desc}
                lead={
                  <>
                    <span {...handleProps} className="sd-grip">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                    <span
                      className="sd-lead sys"
                      style={{ "--c": m.c } as never}
                    >
                      {m.mark}
                    </span>
                  </>
                }
              >
                <Sw p={p} k={m.pref} label={m.name} locked={locked} />
              </SRow>
            )}
          </SortableItem>
        ))}
      </SortableList>
    </SGroup>
  );
}

export function IslandSection() {
  const p = usePrefs();
  const free = !useIsPro();
  const delay = Number(p.get("islandHoverDelay"));
  return (
    <Gate>
      <IslandPlay
        cfg={{
          show: p.get("islandShow"),
          today: p.get("islandToday"),
          week: p.get("islandWeek"),
          focus: p.get("islandFocus"),
          music: p.get("islandMusic"),
          shelf: p.get("islandShelf"),
          hud: p.get("islandHud"),
          dark: p.get("islandOnPlanQuiet"),
          quiet: p.get("islandQuietStandby"),
          haptics: p.get("islandHaptics"),
          peek: String(p.get("islandPeek")) === "off" ? "off" : "hover",
          delay: Number.isFinite(delay) ? delay : 0.3,
          open: String(p.get("islandOpenOn")) === "hover" ? "hover" : "click",
        }}
      />
      <SGroup>
        <SRow
          title={
            <>
              Show the island <ProPill locked={free} feature="the island" />
            </>
          }
          desc={
            free
              ? "The island is part of Pro. Try it above; every setting is shown so you can see what it does."
              : "In the notch, or as a pill on screens without one."
          }
        >
          <Sw p={p} k="islandShow" label="Show the island" locked={free} />
        </SRow>
      </SGroup>
      <div
        className={"sd-stack" + (free ? " sd-dis" : "")}
        aria-disabled={free || undefined}
      >
        <SGroup title="Needt tabs" hint="Always first, in this order.">
          <SRow
            title="Today"
            desc="Current focus and the next tasks."
            lead={lead("tasks")}
          >
            <Sw p={p} k="islandToday" label="Today tab" locked={free} />
          </SRow>
          <SRow
            title="Week"
            desc="Load per day, Plan my week."
            lead={lead("planday")}
          >
            <Sw p={p} k="islandWeek" label="Week tab" locked={free} />
          </SRow>
          <SRow
            title="Focus"
            desc="Start a block on the next task."
            lead={lead("focus")}
          >
            <Sw p={p} k="islandFocus" label="Focus tab" locked={free} />
          </SRow>
        </SGroup>
        <Modules p={p} locked={free} />
        <SGroup title="Moments in the closed island">
          <SRow title="Now playing">
            <Sw p={p} k="islandMomentNow" label="Now playing" locked={free} />
          </SRow>
          <SRow title="AirPods connected">
            <Sw
              p={p}
              k="islandMomentAirpods"
              label="AirPods connected"
              locked={free}
            />
          </SRow>
          <SRow title="Charging">
            <Sw p={p} k="islandMomentCharging" label="Charging" locked={free} />
          </SRow>
          <SRow
            title="Done early"
            desc="A green check when a focus ends before its time."
          >
            <Sw p={p} k="islandMomentDone" label="Done early" locked={free} />
          </SRow>
        </SGroup>
        <SGroup title="Before the next block">
          <SRow title="Warning" desc="The next task slides in.">
            <Pick
              p={p}
              k="islandWarning"
              label="Warning"
              locked={free}
              options={[
                ["off", "Off"],
                ["2", "2 min before"],
                ["5", "5 min before"],
                ["10", "10 min before"],
              ]}
            />
          </SRow>
          <SRow
            title="Standby"
            desc="The island grows and shows one Go. Press and hold the island above to see it."
          >
            <Pick
              p={p}
              k="islandStandby"
              label="Standby"
              locked={free}
              options={[
                ["off", "Off"],
                ["15", "15 s before"],
                ["30", "30 s before"],
                ["60", "1 min before"],
              ]}
            />
          </SRow>
          <SRow
            title="Quiet during standby"
            desc="Music, AirPods and charging moments wait."
          >
            <Sw
              p={p}
              k="islandQuietStandby"
              label="Quiet during standby"
              locked={free}
            />
          </SRow>
        </SGroup>
        <SGroup title="When the day is on plan">
          <SRow
            title="Show nothing"
            desc="The island is just the notch. A white dot appears only when you changed the plan by hand. Double-click the island above to stop the focus and see it."
          >
            <Sw
              p={p}
              k="islandOnPlanQuiet"
              label="Show nothing"
              locked={free}
            />
          </SRow>
        </SGroup>
        <SGroup title="Behaviour">
          <SRow title="Peek">
            <Pick
              p={p}
              k="islandPeek"
              label="Peek"
              width={130}
              locked={free}
              options={[
                ["hover", "On hover"],
                ["off", "Off"],
              ]}
            />
          </SRow>
          <SRow title="Hover delay">
            <Pick
              p={p}
              k="islandHoverDelay"
              label="Hover delay"
              width={100}
              locked={free}
              options={[
                ["0.1", "0.1 s"],
                ["0.3", "0.3 s"],
                ["0.6", "0.6 s"],
                ["1", "1 s"],
              ]}
            />
          </SRow>
          <SRow title="Open">
            <Pick
              p={p}
              k="islandOpenOn"
              label="Open"
              locked={free}
              options={[
                ["click", "On click"],
                ["hover", "On long hover"],
              ]}
            />
          </SRow>
          <SRow title="Displays">
            <Pick
              p={p}
              k="islandDisplays"
              label="Displays"
              width={160}
              locked={free}
              options={[
                ["built-in", "Built-in only"],
                ["all", "All displays"],
                ["main", "Main display"],
              ]}
            />
          </SRow>
          <SRow title="Pill on screens without a notch">
            <Sw
              p={p}
              k="islandPill"
              label="Pill on screens without a notch"
              locked={free}
            />
          </SRow>
          <SRow title="Hide in full screen">
            <Sw
              p={p}
              k="islandHideFullScreen"
              label="Hide in full screen"
              locked={free}
            />
          </SRow>
          <SRow title="Sounds">
            <Sw p={p} k="islandSounds" label="Sounds" locked={free} />
          </SRow>
          <SRow
            title="Haptics on the trackpad"
            desc="A soft tap when it peeks and opens."
          >
            <Sw
              p={p}
              k="islandHaptics"
              label="Haptics on the trackpad"
              locked={free}
            />
          </SRow>
        </SGroup>
      </div>
    </Gate>
  );
}

/* ---------- Focus ---------- */

export function MacFocusSection() {
  const p = usePrefs();
  return (
    <Gate>
      <SGroup title="macOS Focus">
        <SRow
          title="Turn on a Focus with Needt"
          desc="Runs when a Needt focus starts."
        >
          <Pick
            p={p}
            k="macFocusMode"
            label="Turn on a Focus with Needt"
            options={[
              ["off", "Off"],
              ["dnd", "Do Not Disturb"],
              ["work", "Work"],
              ["personal", "Personal"],
            ]}
          />
        </SRow>
        <SRow title="Suggest my focus task" desc="When a macOS Focus turns on.">
          <Sw p={p} k="macFocusSuggest" label="Suggest my focus task" />
        </SRow>
      </SGroup>
      <SGroup title="Timer">
        <SRow title="Timer in the menu bar" desc="Only while a focus runs.">
          <Sw p={p} k="macMenuTimer" label="Timer in the menu bar" />
        </SRow>
        <SRow
          title="iPhone Live Activity on the Mac"
          desc="The focus started on the phone shows in the menu bar."
        >
          <Sw
            p={p}
            k="macLiveActivity"
            label="iPhone Live Activity on the Mac"
          />
        </SRow>
      </SGroup>
    </Gate>
  );
}

/* ---------- Widgets ---------- */

const STYLES = [
  ["A", "Sky", "linear-gradient(180deg,#7fb3ff,#c9dcff)"],
  [
    "B",
    "Pixel",
    "repeating-linear-gradient(90deg,#9ad1ff 0 5px,#7cc0ff 5px 10px)",
  ],
  ["C", "Bento", "linear-gradient(135deg,#ffd36b 0 50%,#ff8fa3 50%)"],
  [
    "E",
    "Lucky cat",
    "radial-gradient(circle at 50% 62%,#1b1b1f 0 26%,#ff7a3d 27%)",
  ],
  ["F", "Noir", "#0d0d10"],
  ["G", "Mist", "linear-gradient(160deg,#e8e6f2,#cfcbe6)"],
  ["H", "Rim", "radial-gradient(circle at 30% 20%,#3a3a44,#0f0f12 70%)"],
  ["D", "Ink", "var(--surface-raised)"],
] as const;

export function WidgetsSection() {
  const p = usePrefs();
  const free = !useIsPro();
  const style = p.get("widgetStyle");
  return (
    <Gate>
      <SGroup
        title="Style for new widgets"
        hint="Each widget can change it later: right-click → Edit widget. In tinted and clear modes every style uses the Ink layout."
      >
        <div
          className="settings-srow-row"
          style={{ display: "block", padding: "14px 12px" }}
        >
          <div
            className="sd-styles"
            role="group"
            aria-label="Style for new widgets"
          >
            {STYLES.map(([k, name, bg]) => (
              <button
                key={k}
                type="button"
                className="sd-style"
                aria-pressed={style === k}
                disabled={p.off}
                onClick={() => p.set("widgetStyle", k)}
              >
                <i style={{ background: bg }} />
                {k} · {name}
              </button>
            ))}
          </div>
        </div>
      </SGroup>
      <SGroup title="Content">
        <SRow title="Show titles when the Mac is locked">
          <Sw
            p={p}
            k="widgetTitlesLocked"
            label="Show titles when the Mac is locked"
          />
        </SRow>
        <SRow
          title="Habits on the widget"
          desc={free ? "Free shows up to 3." : undefined}
        >
          <SSelect
            label="Habits on the widget"
            width={100}
            value={free ? "3" : p.get("widgetHabits")}
            options={
              free
                ? [["3", "3"]]
                : [
                    ["3", "3"],
                    ["5", "5"],
                    ["all", "All"],
                  ]
            }
            disabled={p.off || free}
            onChange={(v) => p.set("widgetHabits", v)}
          />
        </SRow>
      </SGroup>
    </Gate>
  );
}

/* ---------- Siri & Shortcuts ---------- */

const INTENTS = [
  ["Add a task", "“Add pay the rent Friday 15 min”"],
  ["Start focus", "On the next task, or a chosen one"],
  ["Plan my day", "Places today's tasks in free time"],
  ["What's next", "The next task and event"],
  ["Complete task", "Marks a task done"],
  ["Log habit", "Duolingo, Gym …"],
] as const;

export function SiriSection() {
  return (
    <Gate>
      <SGroup title="Actions in Shortcuts and Spotlight">
        {INTENTS.map(([name, desc]) => (
          <SRow key={name} title={name} desc={desc} lead={lead("spark")} />
        ))}
      </SGroup>
      <SGroup>
        <SRow
          title="Open the Shortcuts app"
          desc="Build your own with these actions."
        >
          <SBtn
            onClick={() => {
              window.location.href = "shortcuts://";
            }}
          >
            Open Shortcuts
          </SBtn>
        </SRow>
      </SGroup>
    </Gate>
  );
}
