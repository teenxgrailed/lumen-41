import type { GlyphName } from "../../glyphs/glyph-data";
import type { MenuPlaceId } from "./places";

/** The dock's pick of the landing set, by place (names as on the landing). */
export const DOCK_GLYPH: Partial<Record<MenuPlaceId, GlyphName>> = {
  home: "home",
  calendar: "calendar",
  tasks: "tasks",
  docs: "docs",
  mail: "mail",
  ask: "ai",
  habits: "habits",
  moodboards: "moodboards",
  projects: "projects",
  templates: "templates",
};

/**
 * The dock glyphs whose drawing is a solid shape with a lighter detail cut
 * into it (a tick on the tasks square, the lines on a page, the flap of an
 * envelope). The dock draws every mark in one ink, and the plain way to do
 * that, `filter: brightness(0)`, turns the detail black too: the mark came out
 * as a solid black square (owner screenshots, 23.11.26). These are drawn with
 * `.nfb-duo` instead: the ink replaces the hues, and the detail takes the
 * colour of the button under it (bottom-bar-float.css).
 */
export const DOCK_DUO: ReadonlySet<GlyphName> = new Set<GlyphName>([
  "tasks",
  "docs",
  "calendar",
  "mail",
  "projects",
  "habits",
]);
