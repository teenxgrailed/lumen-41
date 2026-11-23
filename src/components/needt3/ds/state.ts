/**
 * One spelling of "selected", mapped once. The components write the ARIA
 * attribute that is right for their role and `data-state="on" | "off"` from
 * here; the style (src/styles/ds/components.css) reads only `data-state`, so
 * a control is never on in one place and off in another, and a screen never
 * writes `.is-on`, `.is-active` or `.is-picked`.
 *
 *   pressed   a toggle button (aria-pressed)
 *   selected  a tab (aria-selected)
 *   checked   a switch or a radio (aria-checked)
 *   current   where you are: a dock place, a nav row (aria-current="page")
 */
export type SelectedRole = "pressed" | "selected" | "checked" | "current";

/** A state the pointer cannot hold still: only the /admin/ds page asks for it. */
export type ForcedState = "hover" | "pressed" | "focus";

export interface SelectedAttrs {
  "aria-pressed"?: boolean;
  "aria-selected"?: boolean;
  "aria-checked"?: boolean;
  "aria-current"?: "page";
  "data-state": "on" | "off";
}

export function selectedAttrs(role: SelectedRole, on: boolean): SelectedAttrs {
  const state = on ? "on" : "off";
  switch (role) {
    case "pressed":
      return { "aria-pressed": on, "data-state": state };
    case "selected":
      return { "aria-selected": on, "data-state": state };
    case "checked":
      return { "aria-checked": on, "data-state": state };
    case "current":
      return { "aria-current": on ? "page" : undefined, "data-state": state };
  }
}

/** Class names, joined; falsy parts dropped. */
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** The hue names a Chip or a Tile can wash itself with (12 %, nothing more). */
export type Tone = "orange" | "blue" | "violet" | "green" | "yellow" | "pink";
