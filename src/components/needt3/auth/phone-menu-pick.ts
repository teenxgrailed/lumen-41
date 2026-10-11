/**
 * "Build your menu", the phone setup's third step (prototype MobileAuth.jsx
 * MaMenuStep). Pure: what the pill holds, what a tap or a drag does to it,
 * and how it is saved.
 *
 * The bottom pill holds three places. They are saved as
 * `UserSettings.prefs.mobileTiles` in the desktop's spellings ("today" for
 * Home), which `menuTilesFrom` (phone/menu/places.ts) reads back.
 */
import { type MenuPlaceId, menuWord } from "../phone/menu/places";

/** Slots in the pill. */
export const MENU_N = 3;

/** The places a person may put in the pill, in the order the grid shows them. */
export const PICK_PLACES: readonly MenuPlaceId[] = [
  "home",
  "calendar",
  "tasks",
  "docs",
  "mail",
  "habits",
  "moodboards",
  "projects",
  "ask",
];

/** The phone's default pill (Home, Docs, Ask Needt). */
export const DEFAULT_PICK: readonly MenuPlaceId[] = ["home", "docs", "ask"];

const isPick = (id: string): id is MenuPlaceId =>
  (PICK_PLACES as readonly string[]).includes(id);

/** A saved pill, repaired: three distinct pickable places, else the default. */
export function prefsToMenu(saved: readonly string[] | null): string[] {
  if (!saved) return DEFAULT_PICK.slice();
  const out = saved.filter((id, n) => isPick(id) && saved.indexOf(id) === n);
  return out.length === MENU_N ? out : DEFAULT_PICK.slice();
}

/** The list written to `mobileTiles`: the desktop's spelling for Home. */
export function menuToPrefs(menu: readonly string[]): string[] {
  return menu.slice(0, MENU_N).map((id) => (id === "home" ? "today" : id));
}

export const isDefaultMenu = (menu: readonly string[]) =>
  menu.join() === DEFAULT_PICK.join();

export const pickName = (id: string) => (isPick(id) ? menuWord(id) : id);

export interface PickResult {
  menu: string[];
  /** What was read out. */
  say: string;
  /** "full": the pill is full and a new place was tapped (it shakes once). */
  outcome: "added" | "removed" | "full";
}

/** A tap on a section: take the next free slot, or leave when it is in. */
export function pickToggle(menu: readonly string[], id: string): PickResult {
  if (menu.includes(id)) return pickRemove(menu, id);
  if (menu.length >= MENU_N)
    return {
      menu: menu.slice(),
      outcome: "full",
      say: "The pill holds three. Tap one in it to free a slot.",
    };
  const next = [...menu, id];
  return {
    menu: next,
    outcome: "added",
    say:
      `${pickName(id)} is in slot ${next.length}` +
      (next.length === MENU_N ? " — your pill is ready." : "."),
  };
}

/** A tap on a filled slot. */
export function pickRemove(menu: readonly string[], id: string): PickResult {
  return {
    menu: menu.filter((x) => x !== id),
    outcome: "removed",
    say: `${pickName(id)} left the pill — tap a section to fill the slot.`,
  };
}

/**
 * The slot a dragged one would land in: the finger's travel in slot widths
 * (`w` includes the gap), clamped to the filled slots.
 */
export function slotOver(
  from: number,
  dx: number,
  w: number,
  filled: number
): number {
  const max = Math.max(0, filled - 1);
  if (w <= 0) return from;
  return Math.max(0, Math.min(max, Math.round(from + dx / w)));
}

/** The dragged slot's own travel, kept inside the pill (a little overshoot). */
export function clampTravel(
  from: number,
  dx: number,
  w: number,
  filled: number
): number {
  const max = Math.max(0, filled - 1);
  return Math.max(-from * w - 8, Math.min((max - from) * w + 8, dx));
}

/** `from` moved to `over`; the same list when nothing moves. */
export function reorder(
  menu: readonly string[],
  from: number,
  over: number
): string[] {
  const out = menu.slice();
  if (from === over || from < 0 || from >= out.length) return out;
  const [id] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, over)), 0, id);
  return out;
}

/** Which way slot `k` steps aside while `from` is dragged over `over`: -1, 0 or 1. */
export function shiftFor(k: number, from: number, over: number): -1 | 0 | 1 {
  if (from < over && k > from && k <= over) return -1;
  if (from > over && k >= over && k < from) return 1;
  return 0;
}

/** Under this many px a press on a slot stays a tap. */
export const DRAG_SLOP = 6;
