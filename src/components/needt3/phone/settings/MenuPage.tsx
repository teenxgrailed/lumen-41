"use client";

import { useRef, useState } from "react";

import { LuCheck } from "react-icons/lu";

import { useSetPref, useSettings } from "@/lib/needt3/hooks/settings";

import { useMark } from "../../settings/SettingsContext";
import { PkGlyph, pkCx } from "../kit";
import { usePkSide } from "../kit/theme";
import { BarStylePicker } from "../menu/BarStylePicker";
import {
  BAR_PLACE_SLOTS,
  type BarStyle,
  type MenuPlaceId,
  barPlaces,
  barStyleFrom,
  menuTilesFrom,
  menuWord,
} from "../menu/places";
import { PILL_PLACES, PILL_SIZE, pillSlots, toggleSlot } from "./model";
import { PsGroup, PsRow, usePs } from "./parts";

const noop = () => undefined;

/**
 * Menu: the bottom bar's look (`prefs.barStyle`, applied at once), then the
 * three places in the pill. A tap puts a place in the next free
 * slot (another tap takes it out); a tap on a slot empties it. The list is
 * written to `prefs.mobileTiles` (what menu A reads through `menuTilesFrom`)
 * only when the pill is full again, and only into the loaded prefs
 * (`useSetPref` refuses before they load, and the rows are off until then).
 *
 * The half-filled pill (`pill`) lives in `SettingsSheet`, above the face
 * switch, so crossing 700 px keeps it; the saved three always come from the
 * prefs.
 */
export function MenuPage() {
  const mark = useMark();
  const settings = useSettings();
  const setPref = useSetPref();
  const { pill: draft, setPill: setDraft } = usePs();
  const [shake, setShake] = useState(0);
  /* A fourth place was asked for. Said in the group's own hint and by the
     shake, not in a toast: the toast landed over the rows being tapped. */
  const [full, setFull] = useState(false);
  const pending = useRef(false);
  const ready = !!settings.data;
  const saved = menuTilesFrom(settings.data?.prefs);
  /* Only places that have a row here count as taken: a saved id with no row
     (a leftover spelling) held a slot nobody could see or untick, so the pill
     read "full" beside two ticks. */
  const slots = pillSlots(draft ?? saved);

  const toggle = (id: MenuPlaceId) => {
    if (!ready || pending.current) return;
    const move = toggleSlot(slots, id);
    if (move.blocked) {
      setShake((n) => n + 1);
      setFull(true);
      return;
    }
    setFull(false);
    if (!move.save) {
      setDraft(move.slots);
      return;
    }
    setDraft(move.slots);
    pending.current = true;
    void setPref("mobileTiles", move.slots)
      .then((done) => done && mark())
      .catch(noop)
      .finally(() => {
        pending.current = false;
        setDraft(null);
      });
  };

  const side = usePkSide();
  const barStyle = barStyleFrom(settings.data?.prefs);
  const pickBar = (style: BarStyle) => {
    if (!ready || style === barStyle) return;
    void setPref("barStyle", style)
      .then((done) => done && mark())
      .catch(noop);
  };

  const left = PILL_SIZE - slots.length;
  return (
    <>
      <PsGroup title="Bottom bar">
        <div className="ps-bar-style" data-ps-bar-style={barStyle}>
          <BarStylePicker
            value={barStyle}
            places={barPlaces(settings.data?.prefs, BAR_PLACE_SLOTS)}
            side={side}
            disabled={!ready}
            onChange={pickBar}
          />
        </div>
      </PsGroup>
      <PsGroup
        title="In the pill"
        hint={
          full
            ? "The pill holds three — take one out first."
            : left > 0
              ? `Pick ${left} more — the pill always holds three.`
              : "Everything else waits in the menu card, a swipe up from the pill."
        }
      >
        <div
          key={shake}
          className={pkCx("ps-slots", shake > 0 && "is-shake")}
          data-ps-slots={slots.join(",")}
        >
          {Array.from({ length: PILL_SIZE }, (_, i) => {
            const id = slots[i];
            return id ? (
              <button
                key={id}
                type="button"
                className="ps-slot is-full"
                disabled={!ready}
                aria-label={`Take ${menuWord(id)} out of the pill`}
                data-ps-slot={id}
                onClick={() => toggle(id)}
              >
                <PkGlyph place={id} size="m" />
                <span className="ps-slot-word">{menuWord(id)}</span>
              </button>
            ) : (
              <span key={`e${i}`} className="ps-slot is-empty" aria-hidden />
            );
          })}
        </div>
      </PsGroup>
      <PsGroup title="Places">
        {PILL_PLACES.map((id) => {
          const on = slots.includes(id);
          return (
            <PsRow
              key={id}
              glyph={<PkGlyph place={id} size="s" />}
              title={menuWord(id)}
              chevron={false}
              disabled={!ready}
              onOpen={() => toggle(id)}
              data={{ "data-ps-menu-place": id, "aria-pressed": String(on) }}
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
