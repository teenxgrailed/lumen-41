import {
  STARTER_GROUPS,
  type StarterCreateInput,
  type StarterGroup,
  type StarterItem,
  type StarterKind,
  itemDetail,
} from "@/lib/starter-game";

/**
 * The sort board's data, with no React in it (sg-game.jsx's tiles). A tile
 * starts as one of the agent's items. `s` is the lane the agent suggested,
 * `g` the lane the person put it in (null until they do).
 */
export interface SgTile {
  id: string;
  t: string;
  k: StarterKind;
  s: StarterGroup;
  g: StarterGroup | null;
  /** Task and habit: minutes one go takes. */
  min?: number;
  /** Habit: times a week (7 = daily). */
  perWeek?: number;
  /** Project: how far it reaches, in words. */
  horizon?: string;
  /** A date the agent found in what the person said. */
  dueDay?: string;
  /** The first small step; a project is made with it as its first task. */
  firstStep?: string;
}

export function tileFromItem(
  item: StarterItem,
  id: string,
  placed: StarterGroup | null = null
): SgTile {
  return {
    id,
    t: item.title,
    k: item.kind,
    s: item.suggestedGroup,
    g: placed,
    min: item.durationMinutes,
    perWeek: item.perWeek,
    horizon: item.horizon,
    dueDay: item.dueDay,
    firstStep: item.firstStep,
  };
}

/** The line a tile wears under its title: "45 min", "3× a week", "until Dec". */
export const tileDetail = (t: SgTile) =>
  itemDetail({
    kind: t.k,
    durationMinutes: t.min,
    perWeek: t.perWeek,
    horizon: t.horizon,
  });

/** What the editor offers for the "How long / How often / Until" row. */
export const EDITOR_MINUTES = [15, 30, 45, 60, 90] as const;
export const EDITOR_PER_WEEK = [7, 3, 1] as const;
export const EDITOR_HORIZONS = ["this month", "until Dec", "ongoing"] as const;

export const detailLabel = (k: StarterKind) =>
  k === "habit" ? "How often" : k === "project" ? "Until" : "Duration";

export interface SgCounts {
  tasks: number;
  today: number;
  habits: number;
  projects: number;
}

export function countTiles(tiles: readonly SgTile[]): SgCounts {
  const n = (g: StarterGroup) => tiles.filter((x) => x.g === g).length;
  return {
    tasks: n("today") + n("week"),
    today: n("today"),
    habits: n("habit"),
    projects: n("project"),
  };
}

/** "Create 8 tasks, 2 habits, 1 project". */
export function createLabel(c: SgCounts): string {
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  return (
    `Create ${plural(c.tasks, "task")}` +
    (c.habits ? `, ${plural(c.habits, "habit")}` : "") +
    (c.projects ? `, ${plural(c.projects, "project")}` : "")
  );
}

/**
 * The lane decides what a tile becomes: Today and This week make tasks, Habit
 * a habit, Project a project (with its first step, when the agent gave one).
 */
export function createInput(tiles: readonly SgTile[]): StarterCreateInput {
  const placed = tiles.filter((x) => x.g);
  return {
    tasks: placed
      .filter((x) => x.g === "today" || x.g === "week")
      .map((x) => ({
        title: x.t,
        group: x.g as "today" | "week",
        ...(x.min ? { estimateMinutes: x.min } : {}),
        ...(x.dueDay ? { dueDay: x.dueDay } : {}),
      })),
    habits: placed
      .filter((x) => x.g === "habit")
      .map((x) => ({
        title: x.t,
        // A tile that was not a habit starts at the gentlest rhythm.
        perWeek: x.k === "habit" ? (x.perWeek ?? 7) : 1,
        ...(x.min ? { estimateMinutes: x.min } : {}),
      })),
    projects: placed
      .filter((x) => x.g === "project")
      .map((x) => ({
        name: x.t,
        ...(x.firstStep ? { firstStep: x.firstStep } : {}),
        ...(x.k === "project" && x.horizon ? { horizon: x.horizon } : {}),
        ...(x.k === "project" && x.dueDay ? { deadlineDay: x.dueDay } : {}),
      })),
  };
}

export const isGroup = (value: string | null): value is StarterGroup =>
  STARTER_GROUPS.some((g) => g === value);
