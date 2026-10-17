"use client";

/* FIRST-RUN SETUP, ON A PHONE. The desktop's steps, one per screen: what you
   use Needt for, your calendar, your working hours, and (only when this
   server can run an importer) an import. Then Today with a sample day.
   Progress is a strip of dots and a count: a phone has no room for a step
   list beside the step.

   Everything a step decides is written through `useOnboarding`, the same
   controller the desktop uses, so the write guards are the same. The menu
   pill (MenuStep) is no longer part of setup; its defaults stand and it is
   arranged in Settings. */
import * as React from "react";

import {
  LuArrowLeft,
  LuArrowRight,
  LuCheck,
  LuChevronRight,
  LuClock,
  LuCloudOff,
  LuInfo,
  LuMonitor,
  LuMoon,
  LuSun,
} from "react-icons/lu";

import { useUpdateSettings } from "@/lib/needt3/hooks/settings";
import { THEMES, type ThemeChoice } from "@/lib/needt3/theme";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { HoursStep } from "../../auth/HoursStep";
import { USES } from "../../auth/onboarding-data";
import { STEP_SKY } from "../../auth/onboarding-steps";
import type { Onboarding } from "../../auth/useOnboarding";
import { BrandIcon, brandIdForConnection } from "../../brand";
import { ICloudGuide } from "../../connections/ICloudGuide";
import { PxDots } from "../../scenes";
import { pkCx } from "../kit";
import { MaButton, MaHead, MaNote, MaPaper, MaScene, MaTile } from "./Scene";

/** Each step's title: the first words in ink, the last quiet. */
const HEAD: Record<string, readonly [string, string]> = {
  use: ["What’s Needt", "for?"],
  calendar: ["Your", "calendar"],
  hours: ["Working", "hours"],
  import: ["Bring your", "work"],
};

/** The phone's own one-line brief per step. */
const LINE: Record<string, string> = {
  use: "Pick what fits. The first one sets your sample day.",
  calendar: "Needt plans around your events. You can skip this.",
  hours: "Needt only places work inside these hours.",
  import: "Optional. You can also do this later in Settings.",
};

/** Each step's tile, beside its kicker. */
const TILE: Record<string, { place?: string; kind?: string }> = {
  use: { kind: "template" },
  calendar: { place: "calendar" },
  hours: { place: "settings" },
  import: { kind: "doc" },
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

export function PhoneSetup({ ob }: { ob: Onboarding }) {
  const {
    i,
    id,
    ids,
    count,
    step,
    online,
    ready,
    uses,
    toggleUse,
    skipCal,
    setSkipCal,
    guide,
    setGuide,
    calendars,
    importSources,
    canContinue,
    planning,
    connected,
    go,
    finish,
    connect,
    startImport,
  } = ob;
  const last = i === count - 1;

  return (
    <MaScene variant={STEP_SKY[id]}>
      <div className="mau-setup" data-onboarding-step={id}>
        {/* Progress: pill dots, one per step; the theme switch; Skip. */}
        <div className="mau-top">
          <PxDots
            count={count}
            index={i}
            label="Setup"
            names={ids.map((k) => k)}
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
          kicker={`Step ${i + 1} of ${count}`}
          tile={<MaTile size={32} {...TILE[id]} />}
          a={HEAD[id][0]}
          b={HEAD[id][1]}
          line={LINE[id] ?? step[2]}
        />

        <MaPaper className="is-fill">
          <div key={id} className="nx-swap mau-step" data-ma-step={id}>
            {!online ? (
              <MaNote icon={LuCloudOff}>
                You’re offline — connecting a calendar needs a connection. The
                rest of setup still works.
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
                    onClick={() => toggleUse(uid)}
                  />
                ))}
                <span className="mau-hint has-icon">
                  <LuInfo size={14} aria-hidden />
                  {uses.length
                    ? "The first one you picked sets your sample day."
                    : "Pick at least one to continue."}
                </span>
              </div>
            ) : null}

            {id === "calendar" ? (
              <div className="mau-picks">
                {calendars.map((c) => {
                  const on = connected.has(c.provider);
                  return (
                    <Pick
                      key={c.id}
                      multi
                      on={on || (c.id === "apple" && guide)}
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
                      disabled={on || !online}
                      data-ma-cal={c.id}
                      onClick={() =>
                        c.id === "apple"
                          ? setGuide((v) => !v)
                          : c.href && connect(c.href)
                      }
                    />
                  );
                })}
                {guide ? (
                  <div data-ob-icloud-guide="">
                    <ICloudGuide />
                    <MaButton
                      onClick={() => connect("/connections")}
                      data-ob-icloud-open=""
                    >
                      I have the password, open the form
                    </MaButton>
                  </div>
                ) : null}
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
            ) : null}

            {id === "hours" ? <HoursStep ob={ob} /> : null}

            {id === "import" ? (
              <div className="mau-picks">
                {importSources.map((s) => (
                  <Pick
                    key={s.id}
                    on={false}
                    glyph={<BrandIcon id={s.id} size={40} />}
                    label={s.label}
                    sub={s.sub}
                    disabled={!online}
                    data-ma-import={s.id}
                    onClick={() => startImport(s.id)}
                  />
                ))}
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
            <span className="mau-foot-main">
              <MaButton
                primary
                disabled={!canContinue || planning}
                onClick={() => (last ? void finish() : void go(i + 1))}
              >
                {last ? (planning ? "Opening…" : "Open my day") : "Continue"}
                <LuArrowRight size={15} aria-hidden />
              </MaButton>
            </span>
          </div>
        </MaPaper>
      </div>
    </MaScene>
  );
}
