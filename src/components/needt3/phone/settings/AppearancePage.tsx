"use client";

import { LuCheck, LuLock } from "react-icons/lu";

import { appIconDef, appIconSrc } from "@/lib/needt3/app-icon";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { useSetPref, useSettings } from "@/lib/needt3/hooks/settings";
import { useUpdateSettings } from "@/lib/needt3/hooks/settings";
import {
  ACCENTS,
  type Accent,
  type AccentId,
  THEMES,
  type ThemeChoice,
} from "@/lib/needt3/theme";

import { openAppIconPicker, useAppIcon } from "@/store/app-icon";
import { useNeedt3Ui } from "@/store/needt3-ui";

import { ThemePicture, usePalettes } from "../../settings/AppearanceSection";
import { useMark } from "../../settings/SettingsContext";
import { accentLocked, isPro, themeLocked } from "../../settings/derive";
import { pkCx } from "../kit";
import { PsGroup, PsProTag, PsRow, usePs } from "./parts";

const noop = () => undefined;

/** What the theme line says under the tiles (phone-settings.jsx PsAppearance). */
export function themeHint(theme: ThemeChoice) {
  if (theme === "time")
    return "Follows the sun where you are: pale at dawn, Light by day, warm at golden hour, Dark after dusk.";
  if (theme === "system") return "Follows this device's light or dark setting.";
  return "Desktop and phone use the same theme.";
}

/**
 * Appearance. The same rules as the desktop's section: the Time theme and
 * every accent but blue are Pro (a locked tap opens the paywall on that
 * feature, not a write); a theme writes `UserSettings.theme`; an accent lives
 * in `prefs`, so before settings have loaded the pick is refused instead of
 * showing and then not surviving a reload.
 */
export function AppearancePage() {
  const { upgrade } = usePs();
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
  const cur: Accent = ACCENTS.find((a) => a.id === accent) ?? ACCENTS[0];
  const icon = appIconDef(useAppIcon((s) => s.id));

  const pickTheme = (id: ThemeChoice) => {
    if (themeLocked(id, kind)) return upgrade("Time theme");
    setLook({ theme: id });
    void update.mutateAsync({ theme: id }).then(mark).catch(noop);
  };
  const pickAccent = (id: AccentId) => {
    if (accentLocked(id, kind)) return upgrade("Accent colours");
    if (!settings.data) return;
    setLook({ accent: id });
    void setPref("accent", id)
      .then((saved) => saved && mark())
      .catch(noop);
  };

  const swatch = (a: Accent) => {
    const locked = accentLocked(a.id, kind);
    return (
      <button
        key={a.id}
        type="button"
        data-accent={a.id}
        data-ps-accent={a.id}
        aria-label={a.label + (locked ? " — Pro" : "")}
        aria-pressed={accent === a.id}
        className={pkCx(
          "ps-accent",
          accent === a.id && "is-on",
          locked && "is-locked"
        )}
        onClick={() => pickAccent(a.id)}
      >
        {accent === a.id ? <LuCheck size={14} aria-hidden /> : null}
      </button>
    );
  };

  return (
    <>
      <PsGroup title="Theme" hint={themeHint(theme)}>
        <div className="ps-themes">
          {THEMES.map(([id, word]) => {
            const locked = themeLocked(id, kind);
            return (
              <button
                key={id}
                type="button"
                className={pkCx(
                  "ps-theme",
                  theme === id && "is-on",
                  locked && "is-locked"
                )}
                aria-pressed={theme === id}
                data-ps-theme={id}
                onClick={() => pickTheme(id)}
              >
                <span className="ps-theme-pic">
                  <span className="ps-theme-scale">
                    <ThemePicture id={id} palettes={palettes} />
                  </span>
                </span>
                <span className="ps-theme-word">
                  {word}
                  {locked ? <LuLock size={11} aria-hidden /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </PsGroup>
      <PsGroup
        title={
          <span className="ps-title-pro">
            Accent colour
            {pro ? <PsProTag /> : null}
          </span>
        }
        hint={
          pro ? null : "Blue is yours on Free. The other eight come with Pro."
        }
      >
        <div className="ps-accents">
          <div className="ps-accent-row">
            {ACCENTS.filter((a) => !a.gradient).map(swatch)}
          </div>
          <div className="ps-accent-row">
            {ACCENTS.filter((a) => a.gradient).map(swatch)}
          </div>
          <div className="ps-accent-now" data-accent={cur.id}>
            <span className="ps-accent-bar" />
            <span className="ps-accent-word">{cur.label}</span>
            <span className="ps-accent-note">
              {cur.gradient
                ? "Fills take the blend; text and rings take its middle."
                : "Selection, links, the now-line and progress."}
            </span>
          </div>
        </div>
        {pro ? null : (
          <PsRow
            title="Unlock every accent"
            onOpen={() => upgrade("Accent colours")}
            data={{ "data-ps-accent-up": "" }}
          />
        )}
      </PsGroup>
      <PsGroup
        title="App icon"
        hint="Home screen, dock, browser tab and the app."
      >
        <PsRow
          glyph={
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={appIconSrc(icon.id)}
              alt=""
              width={28}
              height={28}
              className="ai-entry-img"
            />
          }
          title="App icon"
          value={icon.name}
          onOpen={() => openAppIconPicker("settings")}
          data={{ "data-app-icon-entry": "" }}
        />
      </PsGroup>
    </>
  );
}
