"use client";

import { LuPlus } from "react-icons/lu";

import { Glyph } from "../../glyphs/Glyph";
import type { PkSide } from "../kit/util";
import { DockGlyph } from "./Glyph";
import { type MenuPlaceId, menuWord } from "./places";

export interface FloatBarProps {
  /** The app theme: the bar is frosted light on light, frosted dark on dark. */
  side: PkSide;
  /** The bar's places (`barPlaces`), in slot order. */
  places: readonly MenuPlaceId[];
  /** The place you are in, or null. */
  screen: MenuPlaceId | null;
  /** The menu card is open over the bar: the bar steps out. */
  open?: boolean;
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
function Slot({ preview, className, children, ...rest }: SlotProps) {
  if (preview) return <span className={className}>{children}</span>;
  return (
    <button type="button" className={className} {...rest}>
      {children}
    </button>
  );
}

/**
 * The floating bottom bar, the second look of the phone's dock
 * (`prefs.barStyle = "float"`). One frosted pill over the content: the
 * places, "+" (the composer) and the dot grid that opens menu A's card, five
 * slots, no labels. The slot you are in sits in a solid circle, the raised
 * ground of the pill (white on light, the raised dark on dark): a ground
 * shift, never the accent. When the place you are in is not one of the bar's,
 * the dot grid carries the circle. Icons are the one ink at ladder alphas.
 *
 * It owns no motion of its own beyond a fade: the card opens from menu A, and
 * the composer morphs out of this pill (`data-nva-pill`, pillRect.ts).
 */
export function FloatBar({
  side,
  places,
  screen,
  open,
  away,
  morph,
  focus,
  onPick,
  onCompose,
  onMenu,
  preview,
}: FloatBarProps) {
  const elsewhere = !screen || !places.includes(screen);
  const hidden = !preview && !!(open || away || morph);
  const className =
    "nfb " +
    (side === "dark" ? "is-dark" : "is-light") +
    (preview ? " is-preview" : "") +
    (hidden ? " is-out" : "");

  const pill = (
    <span className="nfb-pill" data-nva-pill={preview ? undefined : ""}>
      {places.map((id) => {
        const on = screen === id;
        return (
          <Slot
            key={id}
            preview={preview}
            className={"nfb-slot" + (on ? " is-on" : "")}
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
        className="nfb-slot is-add"
        aria-label="New task"
        data-nfb-add=""
        onClick={onCompose}
      >
        <LuPlus size={22} aria-hidden />
      </Slot>
      <Slot
        preview={preview}
        className={"nfb-slot" + (elsewhere ? " is-on" : "")}
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
      inert={hidden || undefined}
    >
      {focus ? <span className="nfb-focus">{focus}</span> : null}
      {pill}
    </nav>
  );
}
