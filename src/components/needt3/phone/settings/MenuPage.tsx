"use client";

import { useRef, useState } from "react";

import { LuCheck } from "react-icons/lu";

import { useSetPref, useSettings } from "@/lib/needt3/hooks/settings";
import { notify } from "@/lib/notifications";

import { useMark } from "../../settings/SettingsContext";
import { PkGlyph, pkCx } from "../kit";
import { type MenuPlaceId, menuTilesFrom, menuWord } from "../menu/places";
import { PILL_PLACES, PILL_SIZE, toggleSlot } from "./model";
import { PsGroup, PsRow } from "./parts";

const noop = () => undefined;

/**
 * Menu: the three places in the pill. A tap puts a place in the next free
 * slot (another tap takes it out); a tap on a slot empties it. The list is
 * written to `prefs.mobileTiles` (what menu A reads through `menuTilesFrom`)
 * only when the pill is full again, and only into the loaded prefs
 * (`useSetPref` refuses before they load, and the rows are off until then).
 *
 * The half-filled pill is this page's own until it is saved; the saved
 * three always come from the prefs.
 */
export function MenuPage() {
  const mark = useMark();
  const settings = useSettings();
  const setPref = useSetPref();
  const [draft, setDraft] = useState<MenuPlaceId[] | null>(null);
  const [shake, setShake] = useState(0);
  const pending = useRef(false);
  const ready = !!settings.data;
  const saved = menuTilesFrom(settings.data?.prefs);
  const slots = draft ?? saved;

  const toggle = (id: MenuPlaceId) => {
    if (!ready || pending.current) return;
    const move = toggleSlot(slots, id);
    if (move.blocked) {
      setShake((n) => n + 1);
      notify.info("The pill holds three — take one out first");
      return;
    }
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

  const left = PILL_SIZE - slots.length;
  return (
    <>
      <PsGroup
        title="In the pill"
        hint={
          left > 0
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
