"use client";

/* "BUILD YOUR MENU", the phone setup's third step (prototype MobileAuth.jsx
   MaMenuStep): the bottom pill in miniature, three slots, and under it the
   sections as tiles. The logic is phone-menu-pick.ts (pure); this is the
   gesture and the markup.

     tap a section -> it takes the next free slot (tap it again to take it out)
     tap a slot    -> it empties
     drag a slot sideways -> reorder; under 6px it stays a tap
     full pill + a new section -> the pill shakes once and says why

   Motion, per the phone rules: the lifted slot and its neighbours move by
   transform only, written through one frameWriter (a single frame per
   pointermove burst); a cancelled pointer never commits a reorder; every
   listener is removed when the drag ends or the step unmounts. Nothing moves
   at rest, and reduced motion turns the nudge and the landing off in the
   vendored sheet. */
import * as React from "react";

import { LuLayers, LuLayoutGrid, LuRotateCcw } from "react-icons/lu";

import {
  DRAG_SLOP,
  MENU_N,
  PICK_PLACES,
  clampTravel,
  isDefaultMenu,
  pickName,
  pickRemove,
  pickToggle,
  reorder,
  shiftFor,
  slotOver,
} from "../../auth/phone-menu-pick";
import { frameWriter, pkCx, pkTrack } from "../kit";
import { MaTile } from "./Scene";

const DEFAULT_SAY =
  "Tap a section to put it in the next free slot. Tap a slot to empty it, or drag it sideways to reorder.";

interface Drag {
  id: string;
  from: number;
  w: number;
  sx: number;
  on: boolean;
  over: number;
}

export function MenuStep({
  menu,
  onMenu,
  onDefault,
  onMoving,
}: {
  menu: readonly string[];
  onMenu: (next: string[]) => void;
  /** Reset to Home · Docs · Ask Needt. */
  onDefault: () => void;
  /** A slot is being dragged (the host parks the sky meanwhile). */
  onMoving?: (moving: boolean) => void;
}) {
  const [say, setSay] = React.useState("");
  /* The id that just landed in a slot (one-shot animation). */
  const [land, setLand] = React.useState<string | null>(null);
  /* The full pill shook (one-shot). */
  const [nudge, setNudge] = React.useState(false);
  const slots = React.useRef<(HTMLButtonElement | null)[]>([]);
  const drag = React.useRef<Drag | null>(null);
  const off = React.useRef<(() => void) | null>(null);
  const swallow = React.useRef(false);
  const swallowTimer = React.useRef(0);
  const [frames] = React.useState(frameWriter);
  /* The latest props, read by the pointer closures. */
  const live = React.useRef({ menu, onMenu, onMoving });
  live.current = { menu, onMenu, onMoving };

  const rest = React.useCallback(() => {
    for (const el of slots.current) if (el) el.style.transform = "";
  }, []);

  /* Leaving the step in the middle of a drag lets go cleanly. */
  React.useEffect(
    () => () => {
      off.current?.();
      off.current = null;
      drag.current = null;
      frames.cancel();
      window.clearTimeout(swallowTimer.current);
    },
    [frames]
  );

  function apply(result: ReturnType<typeof pickToggle>) {
    setSay(result.say);
    if (result.outcome === "full") {
      setNudge(true);
      return;
    }
    live.current.onMenu(result.menu);
    if (result.outcome === "added")
      setLand(result.menu[result.menu.length - 1]);
  }

  function onSlotClick(id: string | null) {
    if (swallow.current) {
      swallow.current = false;
      return;
    }
    if (id) apply(pickRemove(menu, id));
  }

  function onSlotDown(
    e: React.PointerEvent<HTMLButtonElement>,
    id: string,
    from: number
  ) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    /* A second finger while one is dragging is not a second drag. */
    if (drag.current) return;
    const el = e.currentTarget;
    const w = el.getBoundingClientRect().width + 6;
    const d: Drag = { id, from, w, sx: e.clientX, on: false, over: from };
    drag.current = d;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* an old engine without capture: the window listeners still follow it */
    }
    off.current = pkTrack(
      (ev) => {
        const dx = ev.clientX - d.sx;
        if (!d.on) {
          if (Math.abs(dx) < DRAG_SLOP) return;
          d.on = true;
          el.classList.add("is-lifted");
          live.current.onMoving?.(true);
        }
        const filled = live.current.menu.length;
        d.over = slotOver(d.from, dx, d.w, filled);
        const travel = clampTravel(d.from, dx, d.w, filled);
        frames.schedule(() => {
          slots.current.forEach((slot, k) => {
            if (!slot || k >= filled) return;
            slot.style.transform =
              k === d.from
                ? `translateX(${travel}px) scale(1.08)`
                : (() => {
                    const step = shiftFor(k, d.from, d.over);
                    return step ? `translateX(${step * d.w}px)` : "";
                  })();
          });
        });
      },
      (_ev, reason) => {
        off.current = null;
        drag.current = null;
        frames.cancel();
        el.classList.remove("is-lifted");
        rest();
        live.current.onMoving?.(false);
        if (!d.on) return;
        /* The press that moved is not a tap: swallow the click that follows. */
        swallow.current = true;
        window.clearTimeout(swallowTimer.current);
        swallowTimer.current = window.setTimeout(() => {
          swallow.current = false;
        }, 0);
        /* A cancelled pointer (a system gesture, a hold taking the finger)
           never reorders. */
        if (reason === "cancel" || d.over === d.from) return;
        live.current.onMenu(reorder(live.current.menu, d.from, d.over));
        setLand(d.id);
        setSay(`${pickName(d.id)} moved to slot ${d.over + 1}.`);
      },
      e.pointerId
    );
  }

  /* The keyboard's way to reorder: arrows move the focused slot. */
  function onSlotKey(
    e: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
    k: number
  ) {
    const to =
      e.key === "ArrowLeft" ? k - 1 : e.key === "ArrowRight" ? k + 1 : k;
    if (to === k || to < 0 || to >= menu.length) return;
    e.preventDefault();
    onMenu(reorder(menu, k, to));
    setLand(id);
    setSay(`${pickName(id)} moved to slot ${to + 1}.`);
    window.requestAnimationFrame(() => slots.current[to]?.focus());
  }

  const cells: (string | null)[] = Array.from(
    { length: MENU_N },
    (_, k) => menu[k] ?? null
  );

  return (
    <div className="ma-menu" data-ma-menu="">
      <span className="px-kicker ma-menu-kicker">
        <LuLayers size={13} aria-hidden />
        Your pill · three sections
      </span>
      <div className="ma-menu-preview">
        <span className="ma-menu-screen" aria-hidden="true">
          <span className="ma-menu-line is-title" />
          <span className="ma-menu-line" />
          <span className="ma-menu-line is-short" />
          <span className="ma-menu-line" />
        </span>
        <div
          className={pkCx("ma-menu-pill", nudge && "is-nudge")}
          role="group"
          aria-label="Bottom menu"
          data-ma-pill={menu.join(",")}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) setNudge(false);
          }}
        >
          {cells.map((id, k) => (
            <button
              key={id ?? "empty-" + k}
              ref={(el) => {
                slots.current[k] = el;
              }}
              type="button"
              className={pkCx(
                "ma-menu-slot",
                id ? "is-filled" : "is-empty",
                !id && k === menu.length && "is-next"
              )}
              data-ma-slot={k}
              data-ma-slot-id={id ?? undefined}
              aria-label={
                id
                  ? `Slot ${k + 1}: ${pickName(id)} — tap to remove, arrow keys to move`
                  : `Slot ${k + 1}: empty`
              }
              disabled={!id}
              onPointerDown={id ? (e) => onSlotDown(e, id, k) : undefined}
              onKeyDown={id ? (e) => onSlotKey(e, id, k) : undefined}
              onClick={() => onSlotClick(id)}
            >
              {id ? (
                <span
                  className={pkCx("ma-menu-chip", land === id && "is-land")}
                  onAnimationEnd={() => setLand(null)}
                >
                  <MaTile place={id} size={32} />
                </span>
              ) : (
                <span className="ma-menu-hole" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      </div>
      <span className="ma-menu-row">
        <span className="ma-menu-names" data-ma-names>
          {menu.length
            ? menu.map(pickName).join(" · ")
            : "Empty — tap three sections below"}
        </span>
        {isDefaultMenu(menu) ? null : (
          <button
            type="button"
            className="ma-menu-reset"
            data-ma-menu-reset
            onClick={() => {
              onDefault();
              setSay("Back to Home · Docs · Ask Needt.");
            }}
          >
            <LuRotateCcw size={13} aria-hidden />
            Reset
          </button>
        )}
      </span>

      <span className="px-kicker ma-menu-gap ma-menu-kicker">
        <LuLayoutGrid size={13} aria-hidden />
        Sections · tap to add
      </span>
      <div className="ma-menu-grid" role="group" aria-label="Sections">
        {PICK_PLACES.map((id) => {
          const at = menu.indexOf(id);
          return (
            <button
              key={id}
              type="button"
              className={pkCx("ma-menu-tile", at >= 0 && "is-in")}
              aria-pressed={at >= 0}
              data-ma-tile={id}
              onClick={() => apply(pickToggle(menu, id))}
            >
              <MaTile place={id} size={32} />
              <span className="ma-menu-label">{pickName(id)}</span>
              {at >= 0 ? (
                <span className="ma-menu-num" aria-hidden="true">
                  {at + 1}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <span
        className="mau-hint ma-menu-say"
        role="status"
        aria-live="polite"
        data-ma-say
      >
        {say || DEFAULT_SAY}
      </span>
    </div>
  );
}
