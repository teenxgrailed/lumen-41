import type { IconType } from "react-icons";
import { LuBookOpen, LuRocket, LuShirt, LuTag } from "react-icons/lu";

import type { BrandId } from "../brand";

/**
 * Folders lab: the four folders every variant shows. They are shaped like
 * what Needt already holds, so the badges and pills are computed from fields
 * and not typed in:
 *
 *   open / due     counted from the project's tasks (V3Task.projectId, done,
 *                  due): already on the client.
 *   pages          the folder's pages (Docs groups): already on the client.
 *   updatedAt      Project.updatedAt: in the DB, NOT yet on ApiProject.
 *   members        workspace members / ShareInvite: NOT yet per project.
 *   apps           TaskListMapping.provider and the connection catalog
 *                  (brandIdFor): NOT yet per project.
 *
 * The clock is fixed so the shots are the same on every run.
 */
export const LAB_NOW = Date.parse("2026-11-22T12:00:00Z");

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export interface LabPerson {
  id: string;
  name: string;
}

export interface LabTask {
  id: string;
  title: string;
  /** Short due label as peekMeta gives it ("Today", "Tue"). */
  due?: string;
}

export interface LabItem {
  id: string;
  kind: "project" | "docs";
  name: string;
  /** Project colour (a hex from the palette). */
  hue: string;
  emoji: string;
  glyph: IconType;
  tasks: readonly LabTask[];
  /** Open tasks in the project (more than the three shown on the papers). */
  open: number;
  /** Open tasks due today. */
  due: number;
  pages: readonly { id: string; title: string }[];
  members: readonly LabPerson[];
  apps: readonly BrandId[];
  updatedAt: number;
}

const you: LabPerson = { id: "u-maksym", name: "Maksym" };

export const LAB_ITEMS: readonly LabItem[] = [
  {
    id: "p-demesures",
    kind: "project",
    name: "Demesures, drop 03",
    hue: "#d1622a",
    emoji: "🧵",
    glyph: LuShirt,
    tasks: [
      { id: "t1", title: "Approve the factory sample", due: "Today" },
      { id: "t2", title: "Shoot the lookbook", due: "Tue" },
      { id: "t3", title: "Write the product copy", due: "Fri" },
    ],
    open: 14,
    due: 3,
    pages: [],
    members: [you],
    apps: ["gtasks"],
    updatedAt: LAB_NOW - 2 * HOUR,
  },
  {
    id: "d-studio",
    kind: "docs",
    name: "Studio notes",
    hue: "#8b6cf0",
    emoji: "📓",
    glyph: LuBookOpen,
    tasks: [],
    open: 0,
    due: 0,
    pages: [
      { id: "g1", title: "Fabric sourcing log" },
      { id: "g2", title: "Size chart v2" },
      { id: "g3", title: "Shoot moodboard" },
      { id: "g4", title: "Packaging ideas" },
      { id: "g5", title: "Supplier contacts" },
      { id: "g6", title: "Pricing sheet" },
      { id: "g7", title: "Drop 02 recap" },
      { id: "g8", title: "Brand voice" },
    ],
    members: [you],
    apps: ["notion", "gdrive", "obsidian"],
    updatedAt: LAB_NOW - 26 * HOUR,
  },
  {
    id: "p-launch",
    kind: "project",
    name: "Needt launch",
    hue: "#1f9a8a",
    emoji: "",
    glyph: LuRocket,
    tasks: [
      { id: "t4", title: "Fix the Safari bar bands", due: "Today" },
      { id: "t5", title: "Record the Google demo", due: "Today" },
      { id: "t6", title: "Publish the plugin repo", due: "Wed" },
    ],
    open: 23,
    due: 5,
    pages: [],
    members: [you],
    apps: ["gcal", "github", "slack", "linear", "claude"],
    updatedAt: LAB_NOW - 12 * MIN,
  },
  {
    id: "p-resale",
    kind: "project",
    name: "Reselling",
    hue: "#2e9d5b",
    emoji: "🏷️",
    glyph: LuTag,
    tasks: [
      { id: "t7", title: "Photograph the Carhartt lot", due: "Thu" },
      { id: "t8", title: "Relist the unsold jackets" },
      { id: "t9", title: "Pack the Vinted parcels", due: "Sat" },
    ],
    open: 6,
    due: 0,
    pages: [],
    members: [
      you,
      { id: "u-lena", name: "Lena Huber" },
      { id: "u-marc", name: "Marc Vogel" },
      { id: "u-nina", name: "Nina Roth" },
    ],
    apps: ["gcal", "slack"],
    updatedAt: LAB_NOW - 3 * DAY,
  },
];

/** "12m", "2h", "3d": how long ago, as one short token. */
export function ago(at: number, now: number = LAB_NOW): string {
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** The number a folder's badge shows: open tasks, or pages in a doc folder. */
export const countOf = (i: LabItem) =>
  i.kind === "docs" ? i.pages.length : i.open;

/** The unit that goes with `countOf`. */
export const unitOf = (i: LabItem) =>
  i.kind === "docs" ? (i.pages.length === 1 ? "page" : "pages") : "open";

/** What the sheets on a folder say: task titles, or page titles. */
export const sheetsOf = (i: LabItem) =>
  i.kind === "docs"
    ? i.pages.slice(0, 3).map((p) => ({ key: p.id, title: p.title, due: "" }))
    : i.tasks
        .slice(0, 3)
        .map((t) => ({ key: t.id, title: t.title, due: t.due ?? "" }));

/** The one status a folder is in, from its own data. */
export function statusOf(i: LabItem): string {
  if (i.due > 0) return `${i.due} due today`;
  if (i.members.length > 1) return "Shared";
  if (i.apps.length > 0) return "Synced";
  return "Quiet";
}
