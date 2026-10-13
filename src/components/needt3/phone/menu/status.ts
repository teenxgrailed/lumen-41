/**
 * What is waiting in a place, in one grey line, and the small mark on a top
 * tile (prototype nav-a.jsx `nvaStatus` / `nvaBadge`). Pure.
 *
 * A count the app has not loaded yet is `undefined`; the row then says what
 * the place is for (the shell registry's own line) instead of a made-up zero.
 */
import { type MenuPlaceId, menuSub } from "./places";

export interface MenuCounts {
  /** Open tasks due before today. */
  overdue?: number;
  /** Open tasks due today. */
  today?: number;
  /** Open tasks. */
  open?: number;
  /** Open, not fixed, not "no slot", with no place in a day yet. */
  unplaced?: number;
  /** Unread mail in the inbox. */
  mail?: number;
  /** Mail accounts that need the person (by label). */
  mailDown?: readonly string[];
  /** The next timed event still to start today; null = none, undefined = not loaded. */
  nextEvent?: { title: string; at: string; inMin: number } | null;
  /** Live pages, and when the latest was edited ("5 min ago"). */
  docs?: number;
  docsEdited?: string | null;
  /** Live habits, and how many are kept today. */
  habits?: number;
  habitsDone?: number;
  /** Live moodboards, and projects that are not archived. */
  boards?: number;
  projects?: number;
  /** Connected accounts, and the ones that are not (by label). */
  connected?: number;
  connectionsDown?: readonly string[];
}

export interface MenuStatus {
  text: string;
  /** It needs you. */
  alert?: boolean;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const needs = (names: readonly string[], verb: string) =>
  `${names.join(", ")} ${names.length === 1 ? "needs" : "need"} ${verb}`;

export function menuStatus(id: MenuPlaceId, c: MenuCounts = {}): MenuStatus {
  const sub = { text: menuSub(id) };
  switch (id) {
    case "home":
      if (c.overdue)
        return {
          text: `${c.overdue} overdue · ${c.today ?? 0} left today`,
          alert: true,
        };
      return c.today === undefined ? sub : { text: `${c.today} left today` };
    case "calendar":
      if (c.nextEvent === undefined) return sub;
      return c.nextEvent
        ? { text: `Next · ${c.nextEvent.title} at ${c.nextEvent.at}` }
        : { text: "Nothing else today" };
    case "tasks":
      if (c.open === undefined) return sub;
      return {
        text: `${c.open} open${c.unplaced ? ` · ${c.unplaced} not placed` : ""}`,
      };
    case "docs":
      if (c.docs === undefined) return sub;
      return c.docs
        ? {
            text: `${plural(c.docs, "page", "pages")} · edited ${c.docsEdited || "today"}`,
          }
        : { text: "No pages yet" };
    case "mail":
      if (c.mailDown?.length)
        return {
          text: `${c.mail ? `${c.mail} unread · ` : ""}${needs(c.mailDown, "you")}`,
          alert: true,
        };
      if (c.mail === undefined) return sub;
      return { text: c.mail ? `${c.mail} unread` : "All read" };
    case "habits":
      if (c.habits === undefined) return sub;
      return c.habits
        ? { text: `${c.habitsDone ?? 0} of ${c.habits} kept today` }
        : { text: "No habits yet" };
    case "moodboards":
      return c.boards === undefined
        ? sub
        : { text: plural(c.boards, "board", "boards") };
    case "projects":
      return c.projects === undefined
        ? sub
        : { text: plural(c.projects, "project", "projects") };
    case "connections":
      if (c.connectionsDown?.length)
        return { text: needs(c.connectionsDown, "reconnecting"), alert: true };
      return c.connected === undefined
        ? sub
        : {
            text: c.connected
              ? `${c.connected} connected`
              : "Nothing connected yet",
          };
    default:
      // ask, templates, shared, trash, settings: what the place is for
      return sub;
  }
}

export interface MenuBadge {
  text: string;
  alert?: boolean;
}

/** The small mark on a top tile. */
export function menuBadge(
  id: MenuPlaceId,
  c: MenuCounts = {}
): MenuBadge | null {
  if (id === "mail" && c.mail) return { text: String(c.mail) };
  if (id === "home" && c.overdue)
    return { text: String(c.overdue), alert: true };
  if (id === "tasks" && c.overdue)
    return { text: String(c.overdue), alert: true };
  if (
    id === "calendar" &&
    c.nextEvent &&
    c.nextEvent.inMin != null &&
    c.nextEvent.inMin < 60
  )
    return { text: `${c.nextEvent.inMin}m` };
  return null;
}
