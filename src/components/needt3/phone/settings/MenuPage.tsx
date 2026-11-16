"use client";

import { LuCheck } from "react-icons/lu";

import { useNavPins, useRankedPlaces } from "@/lib/needt3/hooks/nav-rank";
import { useSetPref, useSettings } from "@/lib/needt3/hooks/settings";
import { type NavId, isNavId } from "@/lib/needt3/nav-rank";

import { useMark } from "../../settings/SettingsContext";
import { PkGlyph, pkCx } from "../kit";
import { usePkSide } from "../kit/theme";
import { BarStylePicker, saveBarStyle } from "../menu/BarStylePicker";
import {
  BAR_PLACE_SLOTS,
  type BarStyle,
  type MenuPlaceId,
  PILL_RANKABLE,
  barPlaces,
  barStyleFrom,
  menuIdOfNav,
  menuWord,
  navIdOfMenu,
} from "../menu/places";
import { PsGroup, PsRow } from "./parts";

/**
 * Menu: the bottom bar's look (`prefs.barStyle`, applied at once), then the
 * places in the bar. They arrange themselves: the bar holds the places opened
 * most (ranked once a week from `/api/nav/usage`, applied on the next fresh
 * load of the app), the same three in either look, so there is no picker;
 * what is left to choose is pinning. A pinned place keeps its spot
 * (`prefs.navPinned`).
 */
export function MenuPage() {
  const mark = useMark();
  const settings = useSettings();
  const setPref = useSetPref();
  const ready = !!settings.data;
  const ranked = useRankedPlaces();
  const pins = useNavPins();
  const top = barPlaces(ranked, BAR_PLACE_SLOTS);
  const order: MenuPlaceId[] = [];
  for (const id of ranked) {
    const m = menuIdOfNav(id);
    if (m && PILL_RANKABLE.includes(m) && !order.includes(m)) order.push(m);
  }

  const side = usePkSide();
  const barStyle = barStyleFrom(settings.data?.prefs);
  const pickBar = (style: BarStyle) => {
    if (!ready || style === barStyle) return;
    void saveBarStyle(setPref, style, "settings").then((ok) => ok && mark());
  };

  return (
    <>
      <PsGroup title="Bottom bar">
        <div className="ps-bar-style" data-ps-bar-style={barStyle}>
          <BarStylePicker
            value={barStyle}
            places={top}
            side={side}
            disabled={!ready}
            onChange={pickBar}
          />
        </div>
      </PsGroup>
      <PsGroup
        title="In the pill"
        hint="Arranged by what you open most, once a week. Pin a place to keep it where it is."
      >
        <div className="ps-slots" data-ps-slots={top.join(",")}>
          {top.map((id) => (
            <span key={id} className="ps-slot is-full" data-ps-slot={id}>
              <PkGlyph place={id} size="m" />
              <span className="ps-slot-word">{menuWord(id)}</span>
            </span>
          ))}
        </div>
      </PsGroup>
      <PsGroup title="Pinned">
        {order.map((id) => {
          const nav = navIdOfMenu(id);
          const on = isNavId(nav) && pins.pinned.includes(nav as NavId);
          return (
            <PsRow
              key={id}
              glyph={<PkGlyph place={id} size="s" />}
              title={menuWord(id)}
              chevron={false}
              disabled={!pins.ready}
              onOpen={() => {
                if (!isNavId(nav)) return;
                void pins.toggle(nav).then((done) => done && mark());
              }}
              data={{ "data-ps-pin-place": id, "aria-pressed": String(on) }}
              value={
                <span className={pkCx("ps-tick", on && "is-on")}>
                  {on ? <LuCheck size={14} aria-hidden /> : null}
                </span>
              }
            />
          );
        })}
      </PsGroup>
    </>
  );
}
