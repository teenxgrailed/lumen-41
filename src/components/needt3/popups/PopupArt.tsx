import type { CSSProperties } from "react";

import { Glyph, type GlyphName } from "../glyphs/Glyph";

export interface PopupArtProps {
  /**
   * The object's own colour, as on a project folder: any CSS colour, usually
   * a `var(--hue-*)`. It only ever tints the ground; it is never a solid fill.
   */
  hue: string;
  /** A mark in the middle of the picture. Omit for the texture alone. */
  glyph?: GlyphName;
  /** The same hue, a different horizon, so two announcements do not look alike. */
  variant?: 0 | 1 | 2;
}

/**
 * The picture of an update, with no image file: the colour of the thing the
 * update is about, a low horizon of the same colour, and the paper grain the
 * project folders and the landing skies wear (`--dp-grain`). Pure CSS, so it
 * follows light and dark, and it is the same on every announcement.
 */
export function PopupArt({ hue, glyph, variant = 0 }: PopupArtProps) {
  return (
    <div
      className="pp-art"
      data-pp-variant={variant}
      style={{ "--pp-hue": hue } as CSSProperties}
      aria-hidden="true"
    >
      <span className="pp-art-sun" />
      <span className="pp-art-grain" />
      {glyph ? (
        <span className="pp-art-mark">
          <Glyph name={glyph} size={30} />
        </span>
      ) : null}
    </div>
  );
}
