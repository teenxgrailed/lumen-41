/**
 * The phone Places' rules (phone-places.jsx), pure so they are tested apart
 * from the screens. Data and derivations are the desktop's (`connections/derive`,
 * `places/derive`); this file only shapes them for rows, sections and chips.
 * Every date comes in as an argument.
 */
import {
  CATEGORY_LABEL,
  CHIP_LABEL,
  CHIP_ORDER,
  type CnItem,
  type Show,
  chipOf,
  chipsOf,
} from "../../connections/derive";
import type { ConnectionsTab } from "../../connections/useConnectionsController";
import { trashMeta } from "../../places/derive";

/* ---------- connections ---------- */

/** The line under the title (prototype `sub`), from what is connected now. */
export function connectionsSub(
  items: readonly CnItem[],
  tab: ConnectionsTab,
  loaded: boolean
) {
  if (tab === "ai") return "No AI tools connected yet";
  if (!loaded) return "";
  const issues = items.filter((i) => i.state === "disconnected");
  if (issues.length)
    return (
      issues.map((i) => i.name).join(", ") +
      (issues.length === 1 ? " needs reconnecting" : " need reconnecting")
    );
  const live = items.filter((i) => i.state === "connected").length;
  return live ? `${live} connected` : "Nothing connected yet";
}

export interface ConnectionGroup {
  id: string;
  label: string;
  items: CnItem[];
}

/**
 * The apps tab's sections: "Needs you" first (accounts that lost access), then
 * one section per chip in the prototype's order (Mail & chat, Calendars, Work,
 * Files, Creative: `chipOf` maps our categories onto them). An empty section
 * is not drawn.
 */
export function groupConnections(shown: readonly CnItem[]) {
  const down = shown.filter((i) => i.state === "disconnected");
  const rest = shown.filter((i) => i.state !== "disconnected");
  const groups: ConnectionGroup[] = CHIP_ORDER.map((id) => ({
    id,
    label: CHIP_LABEL[id],
    items: rest.filter((i) => chipOf(i) === id),
  })).filter((g) => g.items.length);
  return { down, groups };
}

export type RowTone = "late" | "on" | null;

/** One row's status line and tone. */
export function connectionMeta(
  item: Pick<CnItem, "state" | "detail" | "account" | "name" | "category">,
  busy: boolean
): { text: string; tone: RowTone } {
  if (busy) return { text: "Connecting…", tone: null };
  if (item.state === "disconnected")
    return {
      text: item.detail || "Lost access — reconnect to sync again",
      tone: "late",
    };
  if (item.state === "connected")
    return { text: item.account || item.name, tone: "on" };
  return { text: CATEGORY_LABEL[item.category] ?? item.category, tone: null };
}

export interface ChipDef {
  id: string;
  label: string;
}

/** "All", "Connected", then the prototype's chips that have a card. */
export function connectionChips(items: readonly CnItem[]): ChipDef[] {
  return [
    { id: "all", label: "All" },
    { id: "connected", label: "Connected" },
    ...chipsOf(items).map((id) => ({ id, label: CHIP_LABEL[id] })),
  ];
}

export interface ChipState {
  chip: string;
  show: Show;
}

/**
 * Which chips look pressed. The desktop keeps the category and the
 * Connected / All split apart; the phone shows both in one strip, so
 * "All" is pressed only when neither narrows the list.
 */
export function chipPressed(id: string, s: ChipState) {
  if (id === "all") return s.chip === "all" && s.show === "all";
  if (id === "connected") return s.show === "connected";
  return s.chip === id;
}

/** What pressing a chip does: All clears both, the others toggle their own. */
export function pickChip(id: string, s: ChipState): ChipState {
  if (id === "all") return { chip: "all", show: "all" };
  if (id === "connected")
    return { chip: s.chip, show: s.show === "connected" ? "all" : "connected" };
  return { chip: s.chip === id ? "all" : id, show: s.show };
}

export interface Hit {
  id: string;
  title: string;
  meta?: string;
}

const has = (s: string | null | undefined, q: string) =>
  String(s ?? "")
    .toLowerCase()
    .includes(q.toLowerCase());

/** The pull-down's hits over every app (the prototype's first six). */
export function connectionHits(items: readonly CnItem[], q: string): Hit[] {
  const needle = q.trim();
  if (!needle) return [];
  return items
    .filter((i) => has(`${i.name} ${i.description} ${i.slug}`, needle))
    .slice(0, 6)
    .map((i) => ({
      id: i.key,
      title: i.name,
      meta:
        i.state === "connected"
          ? `Connected · ${i.account ?? i.name}`
          : i.state === "disconnected"
            ? "Needs reconnecting"
            : (CATEGORY_LABEL[i.category] ?? i.category),
    }));
}

/* ---------- templates ---------- */

export function templateHits(
  list: readonly { id: string; name: string; description: string | null }[],
  q: string
): Hit[] {
  const needle = q.trim();
  if (!needle) return [];
  return list
    .filter((t) => has(t.name, needle) || has(t.description, needle))
    .slice(0, 6)
    .map((t) => ({
      id: t.id,
      title: t.name || "Untitled",
      meta: t.description ?? "Start a page from this",
    }));
}

/* ---------- shared ---------- */

export interface RoleView {
  key: "VIEWER" | "EDITOR" | "FULL_ACCESS";
  label: string;
  desc: string;
  icon: "eye" | "pencil" | "shield";
  hue: string;
}

/** The three roles a grant can carry, as the access sheet lists them. */
export const ROLE_VIEWS: readonly RoleView[] = [
  {
    key: "VIEWER",
    label: "Can view",
    desc: "You can read it. Ask the owner for edit access to change it.",
    icon: "eye",
    hue: "var(--v2p-lav)",
  },
  {
    key: "EDITOR",
    label: "Can edit",
    desc: "You can change the page; changes show for everyone.",
    icon: "pencil",
    hue: "var(--success)",
  },
  {
    key: "FULL_ACCESS",
    label: "Full access",
    desc: "You can change the page and its sharing.",
    icon: "shield",
    hue: "var(--info)",
  },
];

/** The role a row shows; an unknown or missing role reads as view-only, as the desktop's label does. */
export function roleView(role: string | null | undefined): RoleView {
  return ROLE_VIEWS.find((r) => r.key === role) ?? ROLE_VIEWS[0];
}

/* ---------- trash ---------- */

export interface TrashRowModel {
  kind: "task" | "board";
  id: string;
  title: string;
  meta: string;
}
export interface TrashSection {
  id: "tasks" | "moodboards";
  label: string;
  glyph: string;
  rows: TrashRowModel[];
}

/**
 * Trash's sections: tasks, then moodboards (pages wait for a list route).
 * Newest deletion first inside each.
 */
export function trashSectionsOf(args: {
  tasks: readonly {
    id: string;
    title: string;
    trashedAt: string | null;
    projectId: string | null;
  }[];
  boards: readonly { id: string; title: string; trashedAt: string | null }[];
  projectName: (id: string | null) => string | undefined;
  now: Date;
  timeZone: string;
}): TrashSection[] {
  const newest = <T extends { trashedAt: string | null }>(a: T, b: T) =>
    String(b.trashedAt).localeCompare(String(a.trashedAt));
  const tasks = [...args.tasks].sort(newest).map((t): TrashRowModel => {
    const from = args.projectName(t.projectId);
    return {
      kind: "task",
      id: t.id,
      title: t.title || "Untitled",
      meta: trashMeta(
        t.trashedAt!,
        args.now,
        args.timeZone,
        from ? `from ${from}` : undefined
      ),
    };
  });
  const boards = [...args.boards].sort(newest).map(
    (b): TrashRowModel => ({
      kind: "board",
      id: b.id,
      title: b.title || "Untitled moodboard",
      meta: trashMeta(b.trashedAt!, args.now, args.timeZone),
    })
  );
  return [
    { id: "tasks" as const, label: "Tasks", glyph: "tasks", rows: tasks },
    {
      id: "moodboards" as const,
      label: "Moodboards",
      glyph: "moodboards",
      rows: boards,
    },
  ].filter((s) => s.rows.length);
}

/** "3 items · kept 30 days", or the promise alone while it is empty. */
export function trashSub(n: number) {
  return n
    ? `${n} ${n === 1 ? "item" : "items"} · kept 30 days`
    : "Tasks and moodboards stay here for 30 days";
}

export function trashHits(sections: readonly TrashSection[], q: string) {
  const needle = q.trim();
  if (!needle) return [];
  return sections
    .flatMap((s) => s.rows)
    .filter((r) => has(r.title, needle))
    .slice(0, 6)
    .map((r) => ({
      id: `${r.kind}:${r.id}`,
      title: r.title,
      meta: `Restore · ${r.meta}`,
    }));
}

/** The disconnect sheet's line (the desktop's wording). */
export function disconnectText(item: Pick<CnItem, "name" | "account">) {
  return `Needt stops reading from ${item.name}${
    item.account && item.account !== item.name ? ` for ${item.account}` : ""
  }. What is already in Needt stays; you can connect again at any time.`;
}

/** The status word in the account sheet. */
export function statusWord(state: CnItem["state"], busy: boolean) {
  if (busy) return "Connecting…";
  return state === "connected"
    ? "Connected"
    : state === "disconnected"
      ? "Needs reconnecting"
      : "Not connected";
}
