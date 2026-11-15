"use client";

/* FIRST-RUN SETUP, ON A PHONE: the bottom bar. Two live previews side by
   side, the classic pill and the floating bar; a tap chooses one and writes
   `prefs.barStyle` at once (only into loaded prefs), so it holds even when
   the rest of setup is skipped. Continue is the setup's own button. */
import { useSetPref, useSettings } from "@/lib/needt3/hooks/settings";

import { usePkSide } from "../kit/theme";
import { BarStylePicker } from "../menu/BarStylePicker";
import {
  BAR_PLACE_SLOTS,
  type BarStyle,
  barPlaces,
  barStyleFrom,
} from "../menu/places";

const noop = () => undefined;

export function BarStyleStep() {
  const settings = useSettings();
  const setPref = useSetPref();
  const side = usePkSide();
  const prefs = settings.data?.prefs;
  const pick = (style: BarStyle) => {
    if (!settings.data || barStyleFrom(prefs) === style) return;
    void setPref("barStyle", style).catch(noop);
  };
  return (
    <div className="mau-picks" data-ma-bar="">
      <BarStylePicker
        value={barStyleFrom(prefs)}
        places={barPlaces(prefs, BAR_PLACE_SLOTS)}
        side={side}
        disabled={!settings.data}
        onChange={pick}
      />
    </div>
  );
}
