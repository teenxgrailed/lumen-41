"use client";

import { LuPlus } from "react-icons/lu";

import { logger } from "@/lib/logger";
import { notify } from "@/lib/notifications";

import { Glyph } from "../../glyphs/Glyph";
import type { PkSide } from "../kit/util";
import { FloatBar } from "./FloatBar";
import { DockGlyph } from "./Glyph";
import { BAR_STYLES, type BarStyle, type MenuPlaceId } from "./places";

const NAME: Record<BarStyle, string> = {
  classic: "Classic",
  float: "Floating",
};

const SUB: Record<BarStyle, string> = {
  classic: "A pill and a + beside it",
  float: "Everything in one light bar",
};

const noop = () => undefined;

const LOG_SOURCE = "BarStylePicker";

/**
 * Write `prefs.barStyle` through `useSetPref`'s setter. Resolves true once
 * saved; a refused or failed write is logged and told to the person, and
 * the bar on screen goes back with the settings cache.
 */
export async function saveBarStyle(
  setPref: (key: string, value: unknown) => Promise<boolean | unknown>,
  style: BarStyle,
  where: "onboarding" | "settings"
): Promise<boolean> {
  try {
    const done = await setPref("barStyle", style);
    if (done === false) throw new Error("settings not loaded");
    return true;
  } catch (error) {
    void logger.warn(
      "Bottom bar style not saved",
      {
        where,
        style,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    notify.error("Could not change the bottom bar. Try again in Settings.");
    return false;
  }
}

/** Menu A's resting pill and its +, drawn still (no springs, no card). */
function ClassicPreview({
  places,
  side,
}: {
  places: readonly MenuPlaceId[];
  side: PkSide;
}) {
  return (
    <span
      className={"bsp-classic " + (side === "dark" ? "is-dark" : "is-light")}
      aria-hidden="true"
    >
      <span className="bsp-cpill">
        {places.map((id, i) => (
          <span key={id} className={"bsp-cicon" + (i === 0 ? " is-on" : "")}>
            <DockGlyph id={id} />
          </span>
        ))}
        <span className="bsp-chair" />
        <span className="bsp-cicon">
          <span className="nva-glyph">
            <Glyph name="more" size={30} />
          </span>
        </span>
      </span>
      <span className="bsp-cadd">
        <LuPlus size={22} />
      </span>
    </span>
  );
}

/**
 * The two bottom bars side by side, live: tap one to choose it. Used by the
 * onboarding step (BarStyleStep) and Settings -> Menu. `onChange` writes
 * `prefs.barStyle`; the bar on screen follows at once.
 */
export function BarStylePicker({
  value,
  places,
  side,
  disabled,
  onChange,
}: {
  value: BarStyle;
  /** The places both previews show (`barPlaces`). */
  places: readonly MenuPlaceId[];
  side: PkSide;
  disabled?: boolean;
  onChange: (style: BarStyle) => void;
}) {
  return (
    <div className="bsp" role="group" aria-label="Bottom bar">
      {BAR_STYLES.map((style) => {
        const on = value === style;
        return (
          <button
            key={style}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            className={"bsp-opt" + (on ? " is-on" : "")}
            data-bar-pick={style}
            onClick={() => onChange(style)}
          >
            <span className="bsp-stage" aria-hidden="true">
              <span className="bsp-scale">
                {style === "classic" ? (
                  <ClassicPreview places={places} side={side} />
                ) : (
                  <FloatBar
                    preview
                    side={side}
                    places={places}
                    screen={places[0] ?? null}
                    onPick={noop}
                    onCompose={noop}
                    onMenu={noop}
                  />
                )}
              </span>
            </span>
            <span className="bsp-name">{NAME[style]}</span>
            <span className="bsp-sub">{SUB[style]}</span>
          </button>
        );
      })}
    </div>
  );
}
