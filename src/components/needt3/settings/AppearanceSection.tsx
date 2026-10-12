"use client";

import { useEffect, useState } from "react";

import { FiCheck, FiLock } from "react-icons/fi";
import { LuSun, LuSunrise, LuSunset } from "react-icons/lu";

import { newDate } from "@/lib/date-utils";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { useUpdateSettings } from "@/lib/needt3/hooks/settings";
import { useSetPref, useSettings } from "@/lib/needt3/hooks/settings";
import {
  ACCENTS,
  type AccentId,
  THEMES,
  type ThemeChoice,
  type TimePalettes,
  placeFromTz,
  readTimePalettes,
  timeThemeAt,
} from "@/lib/needt3/theme";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { Miniature } from "./Miniature";
import { useMark } from "./SettingsContext";
import { accentLocked, isPro, themeLocked, timeNow } from "./derive";
import { ProPill, SGroup } from "./kit";

/**
 * One theme as a small screen, drawn from the palettes themes.css declares
 * (the prototype's Miniature renders the live screen in each theme's class).
 * System is cut down the middle, Time runs the day left to right.
 */
export function ThemePicture({
  id,
  palettes,
}: {
  id: ThemeChoice;
  palettes: TimePalettes | null;
}) {
  const w = 128;
  const h = 80;
  if (!palettes)
    return <span style={{ display: "block", width: w, height: h }} />;
  const sides = {
    light: palettes.day,
    dark: palettes.night,
  };
  const paint = (p: { bg: string; raised: string; ink: string }) => (
    <>
      <span style={{ position: "absolute", inset: 0, background: p.bg }} />
      <span
        style={{
          position: "absolute",
          left: 10,
          right: 10,
          top: 12,
          height: 26,
          borderRadius: 6,
          background: p.raised,
        }}
      />
      <span
        style={{
          position: "absolute",
          left: 16,
          top: 20,
          width: 46,
          height: 4,
          borderRadius: 2,
          background: p.ink,
          opacity: 0.7,
        }}
      />
      <span
        style={{
          position: "absolute",
          left: 16,
          top: 28,
          width: 28,
          height: 3,
          borderRadius: 2,
          background: p.ink,
          opacity: 0.4,
        }}
      />
    </>
  );
  const frame = (children: React.ReactNode) => (
    <span
      aria-hidden="true"
      style={{
        position: "relative",
        display: "block",
        width: w,
        height: h,
        overflow: "hidden",
      }}
    >
      {children}
    </span>
  );
  if (id === "light") return frame(paint(sides.light));
  if (id === "dark") return frame(paint(sides.dark));
  if (id === "system")
    return frame(
      <>
        {paint(sides.light)}
        <span
          style={{
            position: "absolute",
            inset: 0,
            clipPath: "inset(0 0 0 50%)",
          }}
        >
          {paint(sides.dark)}
        </span>
      </>
    );
  const order = [
    palettes.dawn,
    palettes.day,
    palettes.golden,
    palettes.dusk,
    palettes.night,
  ];
  return frame(
    <>
      <span
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(90deg, ${order.map((p) => p.bg).join(", ")})`,
        }}
      />
      <span
        style={{
          position: "absolute",
          left: 10,
          right: 10,
          top: 12,
          height: 26,
          borderRadius: 6,
          background: `linear-gradient(90deg, ${order.map((p) => p.raised).join(", ")})`,
        }}
      />
    </>
  );
}

export function usePalettes() {
  const [p, setP] = useState<TimePalettes | null>(null);
  useEffect(() => {
    const el = document.querySelector(".needt-v3");
    if (el) setP(readTimePalettes(el));
  }, []);
  return p;
}

/** A theme tile's picture: the Home screen drawn small in that theme. */
function ThemeMini({ id, accent }: { id: ThemeChoice; accent: string }) {
  if (id === "system")
    return <Miniature width={128} accent={accent} half={["light", "dark"]} />;
  if (id === "time")
    return (
      <Miniature width={128} accent={accent} diagonal={["light", "dark"]} />
    );
  return <Miniature width={128} accent={accent} theme={id} />;
}

/** The Time card's live reading: where the sun is, and what comes next. */
function TimeNow({ palettes }: { palettes: TimePalettes | null }) {
  if (!palettes) return null;
  const now = timeNow(timeThemeAt(newDate(), placeFromTz(), palettes));
  const Icon =
    now.icon === "sunrise"
      ? LuSunrise
      : now.icon === "sunset"
        ? LuSunset
        : LuSun;
  return (
    <div className="base-row settings-time-now-time-now" data-time-now>
      <span className="settings-time-now-row">
        <Icon size={14} aria-hidden />
      </span>
      <span>{now.line}</span>
    </div>
  );
}

export function AppearanceSection({
  onUpgrade,
}: {
  /** Opens the Plan section: a locked choice sends the person there. */
  onUpgrade: () => void;
}) {
  const mark = useMark();
  const theme = useNeedt3Ui((s) => s.theme);
  const accent = useNeedt3Ui((s) => s.accent);
  const setLook = useNeedt3Ui((s) => s.setLook);
  const plan = usePlan();
  const update = useUpdateSettings();
  const setPref = useSetPref();
  const settings = useSettings();
  const palettes = usePalettes();
  const kind = plan.data?.kind ?? "free";
  const pro = isPro(kind);

  const pickTheme = (id: ThemeChoice) => {
    if (themeLocked(id, kind)) return onUpgrade();
    setLook({ theme: id });
    void update.mutateAsync({ theme: id }).then(mark);
  };
  const pickAccent = (id: AccentId) => {
    if (accentLocked(id, kind)) return onUpgrade();
    // The accent lives in prefs; before they load a write is refused, so
    // the pick would show and then not survive a reload.
    if (!settings.data) return;
    setLook({ accent: id });
    void setPref("accent", id).then((saved) => saved && mark());
  };
  const cur = ACCENTS.find((a) => a.id === accent) ?? ACCENTS[0];

  return (
    <>
      <SGroup
        title="Theme"
        hint={
          theme === "time"
            ? "Follows the sun where you are: pale at dawn, Light by day, warm at golden hour, Dark after dusk."
            : "More themes are on the way."
        }
      >
        <div className="settings-row-7">
          {THEMES.map(([id, label]) => {
            const locked = themeLocked(id, kind);
            return (
              <button
                key={id}
                type="button"
                onClick={() => pickTheme(id)}
                aria-pressed={theme === id}
                data-theme-tile={id}
                data-pro-locked={locked ? "" : undefined}
                title={locked ? "Unlock the Time theme with Pro" : undefined}
                className={
                  "nx-press settings-theme-tile-theme-tile" +
                  (theme === id ? " is-active" : "")
                }
              >
                <span className="settings-theme-tile-span">
                  <span className="settings-theme-tile-span-2">
                    <ThemeMini id={id} accent={accent} />
                  </span>
                </span>
                <span className="settings-theme-tile-span-3">
                  {label}
                  {id === "time" ? <ProPill locked={locked} /> : null}
                </span>
              </button>
            );
          })}
        </div>
        {theme === "time" ? <TimeNow palettes={palettes} /> : null}
      </SGroup>
      <SGroup
        title={
          <span className="settings-pro-title">
            Accent color
            {pro ? <ProPill /> : null}
          </span>
        }
      >
        <div className="settings-accent-card-stack">
          <div className="settings-accent-card-row">
            {[false, true].map((gradient, g) => (
              <span key={String(gradient)} style={{ display: "contents" }}>
                {g === 1 ? (
                  <span
                    className="settings-accent-card-bar"
                    aria-hidden="true"
                  />
                ) : null}
                <span className="settings-accent-card-row-2">
                  {ACCENTS.filter((a) => a.gradient === gradient).map((a) => {
                    const locked = accentLocked(a.id, kind);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        data-accent={a.id}
                        aria-label={a.label + (locked ? " — Pro" : "")}
                        aria-pressed={accent === a.id}
                        title={
                          locked
                            ? `${a.label} — unlock accent colours with Pro`
                            : a.label
                        }
                        data-pro-locked={locked ? "" : undefined}
                        onClick={() => pickAccent(a.id)}
                        className={
                          "nx-press settings-accent-swatch-accent" +
                          (locked ? " is-locked" : "") +
                          (accent === a.id ? " is-active" : "")
                        }
                      >
                        {accent === a.id ? (
                          <span className="settings-accent-swatch-layer">
                            <FiCheck size={13} aria-hidden />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </span>
              </span>
            ))}
          </div>
          {!pro ? (
            <div className="settings-accent-lock" data-settings-accent-lock>
              <FiLock size={12} aria-hidden />
              <span>Blue is yours on Free. The other eight come with Pro.</span>
              <button
                type="button"
                className="pro-limit-up"
                onClick={onUpgrade}
              >
                Upgrade
              </button>
            </div>
          ) : null}
          <div className="settings-accent-card-row-3">
            <span className="base-strong">{cur.label}</span>
            <span className="base-meta">
              {cur.gradient
                ? "Fills take the blend; text and rings take its middle."
                : "Selection, links, the now-line and progress."}
            </span>
            <span className="settings-accent-card-span">
              <span className="settings-accent-card-span-2" />
            </span>
          </div>
        </div>
      </SGroup>
    </>
  );
}
