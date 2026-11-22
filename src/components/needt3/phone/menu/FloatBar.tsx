"use client";

import { LuPlus } from "react-icons/lu";

import { Glyph } from "../../glyphs/Glyph";
import type { PkSide } from "../kit/util";
import { DockGlyph } from "./Glyph";
import { type MenuPlaceId, menuWord } from "./places";

export interface FloatBarProps {
  /** The app theme: a white capsule on light, a dark one on dark. */
  side: PkSide;
  /** The bar's places (`barPlaces`), in slot order. */
  places: readonly MenuPlaceId[];
  /** The place you are in, or null. */
  screen: MenuPlaceId | null;
  /** The menu card is open over the bar: the bar steps out. */
  open?: boolean;
  /**
   * The menu is moving (opening, or shrinking back into the pill): the bar
   * stays out, with no blur of its own, until it settles (rule 12).
   */
  moving?: boolean;
  /** A full-screen layer is up (Ask, a place's cover): the bar steps out. */
  away?: boolean;
  /** The composer is growing out of the bar. */
  morph?: boolean;
  /** The focus button (FocusDockButton) while a session runs, or nothing. */
  focus?: React.ReactNode;
  onPick: (id: MenuPlaceId) => void;
  onCompose: () => void;
  onMenu: () => void;
  /**
   * Drawn still inside a picker (onboarding, Settings): not fixed to the
   * screen, and spans instead of buttons, since the picker's option is the
   * button.
   */
  preview?: boolean;
}

type SlotProps = {
  preview?: boolean;
  className: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement> &
  Record<`data-${string}`, string | undefined>;

/** A slot: a button on the dock, a plain span in a preview. */
function Slot({ preview, className, children, style, ...rest }: SlotProps) {
  if (preview)
    return (
      <span className={className} style={style}>
        {children}
      </span>
    );
  return (
    <button type="button" className={className} style={style} {...rest}>
      {children}
    </button>
  );
}

/**
 * The floating bottom bar, the second look of the phone's dock
 * (`prefs.barStyle = "float"`). One capsule over the content: the
 * places, "+" (the composer) and the dot grid that opens menu A's card, five
 * round raised buttons in a capsule (owner ref, 2026-11-22). The place you are
 * in is a wide ink pill holding its mark and its name, which slides to the
 * next one (translate only, no spring): neutral ink, never the accent. When
 * the place you are in is not one of the bar's, the dot grid carries the
 * pill, named "More". Marks are the one ink.
 *
 * Its own motion is the ink pill sliding and a fade: the card opens from menu
 * A, and the composer morphs out of this capsule (`data-nva-pill`, pillRect.ts).
 */
export function FloatBar({
  side,
  places,
  screen,
  open,
  moving,
  away,
  morph,
  focus,
  onPick,
  onCompose,
  onMenu,
  preview,
}: FloatBarProps) {
  const elsewhere = !screen || !places.includes(screen);
  const hidden = !preview && !!(open || moving || away || morph);
  /* The composer grows out of (and back into) this pill while the card is
     at rest; while the card is open or moving, menu A's own glass is the
     pill box (the same geometry, menu-a.ts nvaFloatPill). The bar only fades,
     never moves, so its box is where it shows. */
  const pillMark = !preview && !open && !moving ? "" : undefined;
  const className =
    "nfb " +
    (side === "dark" ? "is-dark v3-raised-dark" : "is-light") +
    (preview ? " is-preview" : "") +
    (hidden ? " is-out" : "");

  /* Slot order: the places, +, the menu opener. The ink pill stands on the
     place you are in, or on the opener when you are somewhere else. */
  const at = screen ? places.indexOf(screen) : -1;
  const inkAt = at >= 0 ? at : places.length + 1;
  const word = at >= 0 && screen ? menuWord(screen) : "More";
  const slot = (j: number) =>
    ({ "--nfb-j": j, "--nfb-s": j > inkAt ? 1 : 0 }) as React.CSSProperties;

  const pill = (
    <span
      className="nfb-pill v3-raised"
      data-nva-pill={pillMark}
      data-nfb-at={inkAt}
      style={{ "--nfb-i": inkAt } as React.CSSProperties}
    >
      <span className="nfb-ink v3-raised-ink" aria-hidden="true">
        <span key={word} className="nfb-label">
          {word}
        </span>
      </span>
      {places.map((id, j) => {
        const on = screen === id;
        return (
          <Slot
            key={id}
            preview={preview}
            className={"nfb-slot v3-raised-disc" + (on ? " is-on" : "")}
            style={slot(j)}
            aria-label={menuWord(id)}
            aria-current={on ? "page" : undefined}
            data-nfb-place={id}
            onClick={() => onPick(id)}
          >
            <DockGlyph id={id} />
          </Slot>
        );
      })}
      <Slot
        preview={preview}
        className="nfb-slot v3-raised-disc is-add"
        style={slot(places.length)}
        aria-label="New task"
        data-nfb-add=""
        onClick={onCompose}
      >
        <LuPlus size={20} aria-hidden />
      </Slot>
      <Slot
        preview={preview}
        className={"nfb-slot v3-raised-disc" + (elsewhere ? " is-on" : "")}
        style={slot(places.length + 1)}
        aria-label={
          "Every place" +
          (elsewhere && screen ? ` — you are in ${menuWord(screen)}` : "")
        }
        aria-expanded={!!open}
        data-nfb-menu=""
        onClick={onMenu}
      >
        <span className="nva-glyph" aria-hidden="true">
          <Glyph name="more" size={30} />
        </span>
      </Slot>
    </span>
  );

  if (preview)
    return (
      <span className={className} data-bar-style="float">
        {pill}
      </span>
    );
  return (
    <nav
      className={className}
      aria-label="Places"
      data-bar-style="float"
      data-assistant-avoid
      data-nva-moving={moving ? "" : undefined}
      inert={hidden || undefined}
    >
      {focus ? <span className="nfb-focus">{focus}</span> : null}
      {pill}
    </nav>
  );
}
