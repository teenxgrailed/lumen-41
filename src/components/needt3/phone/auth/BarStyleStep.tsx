"use client";

/* FIRST-RUN SETUP, ON A PHONE: the bottom bar. Two live previews side by
   side, the classic pill and the floating bar; a tap chooses one and writes
   `prefs.barStyle` at once (only into loaded prefs), so it holds even when
   the rest of setup is skipped. Continue is the setup's own button. The
   previews hold the places the ranked list puts first for the answers so
   far (read straight from the prefs, so the order the shell holds for the
   load is not fixed here before the answers are in). */
import { usePlan } from "@/lib/needt3/hooks/plan";
import { useSetPref, useSettings } from "@/lib/needt3/hooks/settings";
import { rankedPlaces } from "@/lib/needt3/nav-rank";

import { usePkSide } from "../kit/theme";
import { BarStylePicker, saveBarStyle } from "../menu/BarStylePicker";
import {
  BAR_PLACE_SLOTS,
  type BarStyle,
  barPlaces,
  barStyleFrom,
} from "../menu/places";

export function BarStyleStep() {
  const settings = useSettings();
  const setPref = useSetPref();
  const side = usePkSide();
  const plan = usePlan();
  const prefs = settings.data?.prefs;
  const ranked = rankedPlaces(prefs, { free: plan.data?.kind === "free" });
  const pick = (style: BarStyle) => {
    if (!settings.data || barStyleFrom(prefs) === style) return;
    void saveBarStyle(setPref, style, "onboarding");
  };
  return (
    <div className="mau-picks" data-ma-bar="">
      <BarStylePicker
        value={barStyleFrom(prefs)}
        places={barPlaces(ranked, BAR_PLACE_SLOTS)}
        side={side}
        disabled={!settings.data}
        onChange={pick}
      />
    </div>
  );
}
