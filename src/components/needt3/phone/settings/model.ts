/**
 * Phone Settings, the parts that decide things (phone-settings.jsx), pure so
 * they are tested apart from the sheet: the page list, how a row summarises its
 * page, the pill's three slots, what Esc does, and the connections line.
 *
 * Nothing here reads or writes data. The values come from the same hooks the
 * desktop sheet uses (`@/lib/needt3/hooks/{settings,account,plan}`), and every
 * write goes through the guards those pages already have.
 */
import type { V3Alerts, V3Schedule } from "@/lib/needt3/hooks/account";
import type { V3Connection } from "@/lib/needt3/hooks/connections";
import { THEMES, type ThemeChoice } from "@/lib/needt3/theme";

import {
  SECTION_TITLES,
  type SectionId,
  hourLabel,
} from "../../settings/derive";
import type { MenuPlaceId } from "../menu/places";

/* ---------- pages ---------- */

/** A drill-in page of the phone sheet: the desktop's sections, plus the pill. */
export type PsPageId = SectionId | "menu";

export const PS_TITLES: Record<PsPageId, string> = {
  ...SECTION_TITLES,
  menu: "Menu",
};

/**
 * The main list's groups, in the prototype's order (PsMain). "connections" is
 * the one row that leaves Settings instead of opening a page. Sidebar (the
 * desktop's tile list) is not here: `prefs.sidebar` is Customize Sidebar's and
 * `sidebarTiles` only seeds it, so a second writer would fight it.
 */
export type PsRowId = PsPageId | "connections";

export const PS_LIST: readonly {
  title?: string;
  hint?: string;
  rows: readonly PsRowId[];
}[] = [
  { rows: ["account", "plan"] },
  {
    title: "Preferences",
    rows: ["general", "appearance", "day", "tasks", "focus", "alerts"],
  },
  {
    hint: "The three places in the pill at the bottom of the phone.",
    rows: ["menu"],
  },
  { rows: ["connections", "data"] },
  { rows: ["keys", "about"] },
];

/** Pages a deep link (`/settings#plan`) may land on: every desktop section. */
export function isPsPage(value: unknown): value is PsPageId {
  return typeof value === "string" && value in PS_TITLES;
}

/* ---------- row summaries ---------- */

export function themeWord(theme: ThemeChoice) {
  return THEMES.find(([id]) => id === theme)?.[1] ?? "System";
}

/** "09:00 – 17:00 · week from Monday"; the hours wait for the schedule. */
export function daySummary(
  schedule: Pick<V3Schedule, "workHourStart" | "workHourEnd"> | undefined,
  weekStartDay: string | undefined
) {
  const week = `week from ${weekStartDay === "sunday" ? "Sunday" : "Monday"}`;
  if (!schedule) return week;
  return `${hourLabel(schedule.workHourStart)} – ${hourLabel(schedule.workHourEnd)} · ${week}`;
}

export function alertsSummary(a: V3Alerts | undefined) {
  if (!a) return "Daily plan, overdue, weekly review";
  return a.dailyPlan ? `Daily plan at ${a.dailyPlanTime}` : "Daily plan off";
}

export interface ConnectionsLine {
  connected: number;
  /** The first account that needs signing in again, if any. */
  attention: string | null;
}

/** The Connections row: how many are on, and whether one needs attention. */
export function connectionsLine(
  list: readonly V3Connection[] | undefined
): ConnectionsLine {
  const all = list ?? [];
  return {
    connected: all.filter((c) => c.state === "connected").length,
    attention: all.find((c) => c.state === "error")?.label ?? null,
  };
}

/* ---------- the pill's three places (Menu page) ---------- */

export const PILL_SIZE = 3;

/**
 * The places a person may put in the pill, in the prototype's order
 * (MA_MENU_PLACES). Settings is never one of the three; the rest of the
 * places wait in the menu card.
 */
export const PILL_PLACES: readonly MenuPlaceId[] = [
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

export interface SlotMove {
  slots: MenuPlaceId[];
  /** The pill is full again: write it. Never while a slot is empty. */
  save: boolean;
  /** A fourth place was asked for; nothing changed. */
  blocked: boolean;
}

/**
 * Tap a place: it takes the next free slot, or leaves its slot. The list is
 * written only when it holds exactly three, so the pill never saves a short
 * list that `menuTilesFrom` would throw away.
 */
export function toggleSlot(
  slots: readonly MenuPlaceId[],
  id: MenuPlaceId
): SlotMove {
  if (slots.includes(id))
    return {
      slots: slots.filter((x) => x !== id),
      save: false,
      blocked: false,
    };
  if (slots.length >= PILL_SIZE)
    return { slots: [...slots], save: false, blocked: true };
  const next = [...slots, id];
  return { slots: next, save: next.length === PILL_SIZE, blocked: false };
}

/* ---------- keys ---------- */

/**
 * Esc on a drill-in page goes back to the list; on the list (or with a picker
 * or another sheet over Settings) it is the sheet's own, which closes.
 */
export function escAction(state: {
  open: boolean;
  onPage: boolean;
  pickerOpen: boolean;
  otherSheetOpen: boolean;
}): "back" | "leave" {
  return state.open &&
    state.onPage &&
    !state.pickerOpen &&
    !state.otherSheetOpen
    ? "back"
    : "leave";
}

/* ---------- option lists ---------- */

export const LINK_OPTIONS: readonly (readonly [string, string])[] = [
  ["ask", "Always ask"],
  ["web", "Browser"],
  ["app", "Desktop app"],
];

export const SOUND_OPTIONS: readonly (readonly [string, string])[] = [
  ["none", "Silent"],
  ["tick", "Tick"],
  ["chime", "Chime"],
];

export const WEEK_OPTIONS: readonly (readonly [string, string])[] = [
  ["monday", "Monday"],
  ["sunday", "Sunday"],
];

export const VIEW_OPTIONS: readonly (readonly [string, string])[] = [
  ["week", "Week"],
  ["days", "Agenda"],
];
