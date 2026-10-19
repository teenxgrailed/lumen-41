import type { CSSProperties } from "react";

import { GLYPHS, type GlyphName } from "./glyph-data";

export { GLYPH_NAMES, type GlyphName } from "./glyph-data";

/**
 * A landing-page glyph (same names as the landing's assets/glyphs). The
 * landing's light-theme hexes are mapped to design-system tokens at build time
 * (scripts/gen-glyphs.mjs), so the mark follows light, dark and sky. The accent
 * is only ever a mark here, never a fill behind one. Decorative: aria-hidden;
 * the control that holds it carries the label.
 */
export function Glyph({
  name,
  size = 24,
  className,
  style,
}: {
  name: GlyphName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const g = GLYPHS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox={g.vb}
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: g.body }}
    />
  );
}
