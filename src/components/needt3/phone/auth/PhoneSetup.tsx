"use client";

/* FIRST-RUN SETUP, ON A PHONE (prototype MobileAuth.jsx MbSetup). The desktop's
   five steps, one per screen: what you use Needt for, calendar + hours + time
   zone, your menu (the bottom pill), the first task, and where it went.
   Progress is a strip of dots and a count: a phone has no room for a step list
   beside the step.

   Everything a step decides is written through `useOnboarding`, the same
   controller the desktop uses, so the write guards are the same: no prefs write
   before settings have loaded, working hours saved only when loaded and
   changed, only steps the person stood on are saved. The pill is saved as
   `prefs.mobileTiles`.

   Not ported, and why: the composer line with its day/time/duration chips and
   the client-side planner (`coParse`, `firstTask`: the server's scheduler owns
   placement, so the last step shows what it returned, as on the desktop); the
   mini timeline of the placed task (it needs that planner's busy blocks);
   half-hour working hours (the schema stores whole hours); the in-flow
   calendar OAuth mock (connecting leaves for the provider's consent screen). */
import * as React from "react";

import {
  LuArrowLeft,
  LuArrowRight,
  LuCheck,
  LuChevronRight,
  LuClock,
  LuCloudOff,
  LuGlobe,
  LuInfo,
  LuMonitor,
  LuMoon,
  LuSparkles,
  LuSun,
} from "react-icons/lu";

import { NeedtPicker } from "@/components/ui/needt-picker";

import { useUpdateSettings } from "@/lib/needt3/hooks/settings";
import { THEMES, type ThemeChoice } from "@/lib/needt3/theme";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { CALS, USES } from "../../auth/onboarding-data";
import { STEPS, STEP_SKY } from "../../auth/onboarding-steps";
import { DEFAULT_PICK, MENU_N } from "../../auth/phone-menu-pick";
import type { Onboarding } from "../../auth/useOnboarding";
import { BrandIcon, brandIdForConnection } from "../../brand";
import { PwMiniTask, PxDots } from "../../scenes";
import { pkCx } from "../kit";
import { MenuStep } from "./MenuStep";
import { MaButton, MaHead, MaNote, MaPaper, MaScene, MaTile } from "./Scene";

/** Each step's title: the first words in ink, the last quiet. */
const HEAD: Record<string, readonly [string, string]> = {
  use: ["What’s Needt", "for?"],
  setup: ["Calendar &", "hours"],
  sidebar: ["Build your", "menu"],
  first: ["Your first", "task"],
  placed: ["Where Needt", "put it"],
};

/** The phone's own one-line brief per step. */
const LINE: Record<string, string> = {
  use: "Pick all that fit.",
  setup: "Needt plans around your events, inside your hours.",
  sidebar:
    "Three sections live in the pill at the bottom. The rest are one swipe up.",
  first: "Type it the way you’d say it.",
  placed: "Move it any time — nothing is locked.",
};

/** Each step's tile, beside its kicker. */
const TILE: Record<string, { place?: string; kind?: string }> = {
  use: { kind: "template" },
  setup: { place: "calendar" },
  sidebar: { place: "settings" },
  first: { kind: "task" },
  placed: { kind: "event" },
};

const THEME_ICON = {
  system: LuMonitor,
  light: LuSun,
  dark: LuMoon,
  time: LuClock,
} as const;

/** The theme as a small switch in the corner; the words only on the chosen one. */
function PhoneThemeSwitch() {
  const theme = useNeedt3Ui((s) => s.theme);
  const setTheme = useNeedt3Ui((s) => s.setTheme);
  const update = useUpdateSettings();
  return (
    <div
      className="auth-theme mau-theme"
      role="radiogroup"
      aria-label="Theme"
      data-px-calm
    >
      {THEMES.map(([id, label]) => {
        const Icon = THEME_ICON[id];
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={theme === id}
            aria-label={label}
            title={label}
            className={pkCx("auth-theme-b", theme === id && "is-on")}
            data-ob-theme={id}
            onClick={() => {
              setTheme(id as ThemeChoice);
              void update.mutateAsync({ theme: id }).catch(() => undefined);
            }}
          >
            <Icon size={14} aria-hidden />
            <span className="ma-theme-l">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A row with a check at the end, square when several can be picked. */
function Pick({
  on,
  multi,
  glyph,
  label,
  sub,
  disabled,
  onClick,
  ...data
}: {
  on: boolean;
  multi?: boolean;
  glyph: React.ReactNode;
  label: string;
  sub: string;
  disabled?: boolean;
  onClick: () => void;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <button
      type="button"
      {...data}
      disabled={disabled}
      aria-pressed={on}
      onClick={onClick}
      className={pkCx("mau-pick", on && "is-on")}
    >
      <span className="mau-pick-glyph">{glyph}</span>
      <span className="mau-pick-text">
        <span className="mau-pick-label">{label}</span>
        <span className="mau-pick-sub">{sub}</span>
      </span>
      <span
        className={pkCx("mau-check", multi && "is-multi")}
        aria-hidden="true"
      >
        {on ? <LuCheck size={13} /> : null}
      </span>
    </button>
  );
}

/** The product's one picker (check:ui-contracts retires a bare select). */
function Select({
  value,
  options,
  onChange,
  label,
  invalid,
  wide,
}: {
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (v: string) => void;
  label: string;
  invalid?: boolean;
  wide?: boolean;
}) {
  return (
    <span
      className={pkCx(
        "auth-select",
        wide && "is-wide",
        invalid && "is-invalid"
      )}
    >
      <NeedtPicker
        value={value}
        options={options.map(([v, l]) => ({ value: v, label: l }))}
        onValueChange={onChange}
        ariaLabel={label}
        triggerVariant="field"
      />
    </span>
  );
}

export function PhoneSetup({ ob }: { ob: Onboarding }) {
  const {
    i,
    id,
    online,
    ready,
    uses,
    setUses,
    start,
    setStart,
    end,
    setEnd,
    bad,
    tz,
    setTz,
    zoneOptions,
    skipCal,
    setSkipCal,
    menu,
    setMenu,
    title,
    setTitle,
    first,
    adding,
    planning,
    connected,
    hours,
    hourOpts,
    go,
    skipTiles,
    addTask,
    finish,
    connect,
  } = ob;
  /* A slot of the pill is being dragged: the sky holds its frame meanwhile. */
  const [moving, setMoving] = React.useState(false);
  const step = STEPS[i];
  const menuFull = menu.length === MENU_N;

  return (
    <MaScene variant={STEP_SKY[id]} parked={moving}>
      <div className="mau-setup" data-onboarding-step={id}>
        {/* Progress: pill dots, one per step; the theme switch; Skip. */}
        <div className="mau-top">
          <PxDots
            count={STEPS.length}
            index={i}
            label="Setup"
            names={STEPS.map((s) => s[1])}
            className="mau-dots"
          />
          <PhoneThemeSwitch />
          <button
            type="button"
            className="mau-skip"
            data-ob-skip
            data-px-calm
            disabled={!ready}
            onClick={() => void finish(true)}
          >
            Skip
            <LuChevronRight size={14} aria-hidden />
          </button>
        </div>

        <MaHead
          key={"h" + id}
          className="is-step nx-swap"
          kicker={`Step ${i + 1} of ${STEPS.length}`}
          tile={<MaTile size={32} {...TILE[id]} />}
          a={HEAD[id][0]}
          b={HEAD[id][1]}
          line={LINE[id] ?? step[2]}
        />

        <MaPaper className="is-fill">
          <div key={id} className="nx-swap mau-step" data-ma-step={id}>
            {!online ? (
              <MaNote icon={LuCloudOff}>
                You’re offline — connecting a calendar and adding a task need a
                connection. The rest of setup still works.
              </MaNote>
            ) : null}

            {id === "use" ? (
              <div
                className="mau-picks"
                role="group"
                aria-label="What you use Needt for"
              >
                {USES.map(([uid, label, sub, art]) => (
                  <Pick
                    key={uid}
                    multi
                    on={uses.includes(uid)}
                    glyph={<MaTile kind={art} size={40} />}
                    label={label}
                    sub={sub}
                    data-ma-use={uid}
                    onClick={() =>
                      setUses((l) =>
                        l.includes(uid)
                          ? l.filter((x) => x !== uid)
                          : [...l, uid]
                      )
                    }
                  />
                ))}
                <span className="mau-hint has-icon">
                  <LuInfo size={14} aria-hidden />
                  Pick one or more — it only changes what Needt suggests first.
                </span>
              </div>
            ) : null}

            {id === "setup" ? (
              <>
                <div className="mau-picks">
                  {CALS.map((c) => {
                    const on = connected.has(c.provider);
                    return (
                      <Pick
                        key={c.id}
                        multi
                        on={on}
                        glyph={
                          <BrandIcon
                            id={brandIdForConnection({
                              kind: "calendar",
                              provider: c.provider,
                            })}
                            size={40}
                          />
                        }
                        label={c.title}
                        sub={on ? "Connected" : c.sub}
                        disabled={on || !c.href || !online}
                        data-ma-cal={c.id}
                        onClick={() => c.href && connect(c.href)}
                      />
                    );
                  })}
                  <Pick
                    on={skipCal}
                    glyph={
                      <MaTile icon={LuClock} hue="var(--v2p-ink-2)" size={40} />
                    }
                    label="Skip for now"
                    sub="Connect one later from Settings"
                    data-ma-cal="skip"
                    onClick={() => setSkipCal((v) => !v)}
                  />
                </div>
                <div className="ma-hours mau-hours">
                  <span className="mau-field-label has-tile">
                    <MaTile icon={LuClock} hue="var(--accent)" size={28} />
                    Working hours
                  </span>
                  <div className="ma-hours-line">
                    <Select
                      label="Day starts"
                      value={String(start)}
                      options={hourOpts}
                      onChange={(v) => setStart(Number(v))}
                    />
                    <span className="auth-ob-to">to</span>
                    <Select
                      label="Day ends"
                      value={String(end)}
                      invalid={bad}
                      options={hourOpts}
                      onChange={(v) => setEnd(Number(v))}
                    />
                  </div>
                  {bad ? (
                    <span className="auth-error-text">
                      The day has to end at least an hour after it starts.
                    </span>
                  ) : null}
                  <span className="mau-field-label has-tile">
                    <MaTile icon={LuGlobe} hue="var(--info)" size={28} />
                    Time zone
                  </span>
                  <Select
                    wide
                    label="Time zone"
                    value={tz || zoneOptions[0][0]}
                    options={zoneOptions}
                    onChange={setTz}
                  />
                  <span className="mau-hint has-icon">
                    <LuInfo size={14} aria-hidden />
                    Needt only places work inside these hours.
                  </span>
                </div>
              </>
            ) : null}

            {id === "sidebar" ? (
              <MenuStep
                menu={menu}
                onMenu={setMenu}
                onDefault={() => setMenu(DEFAULT_PICK.slice())}
                onMoving={setMoving}
              />
            ) : null}

            {id === "first" ? (
              <div className="mau-picks">
                <span className="ma-first-row">
                  <MaTile kind="task" size={32} />
                  <input
                    className="co-input"
                    value={title}
                    spellCheck={false}
                    autoComplete="off"
                    enterKeyHint="done"
                    placeholder="New task"
                    aria-label="Task title"
                    data-ob-composer
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void addTask();
                      }
                    }}
                  />
                </span>
                <span className="mau-hint has-icon">
                  <LuSparkles size={14} aria-hidden />
                  Needt finds it a free slot in your hours.
                </span>
              </div>
            ) : null}

            {id === "placed" && first ? (
              <div className="mau-picks">
                <span className="mau-kicker is-in">
                  <MaTile place="calendar" size={28} />
                  Your first task · your hours {hours}
                </span>
                <PwMiniTask
                  title={first.title}
                  chip={
                    first.estimatedMinutes
                      ? `${first.estimatedMinutes} min`
                      : null
                  }
                />
                <p className="auth-ob-why mau-why" data-ob-reason>
                  <LuSparkles size={14} aria-hidden />
                  <span>
                    {first.scheduledStart
                      ? `Needt placed it for ${first.scheduledStart.replace("T", " ")}, inside your hours.`
                      : "Needt places it in your first free slot inside these hours as soon as it has your calendar. You will see it on Home."}
                  </span>
                </p>
              </div>
            ) : null}
          </div>

          <div className="mau-foot">
            {i > 0 ? (
              <button
                type="button"
                className="mau-text"
                data-ma-back
                onClick={() => void go(i - 1)}
              >
                <LuArrowLeft size={15} aria-hidden />
                Back
              </button>
            ) : null}
            {id === "sidebar" ? (
              <button
                type="button"
                className="mau-text"
                data-ma-menu-skip
                onClick={skipTiles}
              >
                Skip
                <LuChevronRight size={15} aria-hidden />
              </button>
            ) : null}
            {id === "first" ? (
              <button
                type="button"
                className="mau-text mau-skiptask"
                data-ma-skip-task
                disabled={!ready}
                onClick={() => void finish()}
              >
                Skip — open Needt
                <LuArrowRight size={15} aria-hidden />
              </button>
            ) : null}
            <span className="mau-foot-main">
              {id === "first" ? (
                <MaButton
                  primary
                  auto
                  disabled={!title.trim() || adding || !online}
                  onClick={() => void addTask()}
                >
                  {adding ? "Adding…" : "Add task"}
                </MaButton>
              ) : id === "placed" ? (
                <MaButton
                  primary
                  disabled={!ready}
                  onClick={() => void finish()}
                >
                  {planning ? "Opening…" : "Open my day"}
                  <LuArrowRight size={15} aria-hidden />
                </MaButton>
              ) : (
                <MaButton
                  primary
                  disabled={
                    !ready ||
                    (id === "setup" && bad) ||
                    (id === "sidebar" && !menuFull)
                  }
                  onClick={() => void go(i + 1)}
                >
                  {id === "sidebar" && !menuFull
                    ? `Pick ${MENU_N - menu.length} more`
                    : "Continue"}
                  <LuArrowRight size={15} aria-hidden />
                </MaButton>
              )}
            </span>
          </div>
        </MaPaper>
      </div>
    </MaScene>
  );
}
