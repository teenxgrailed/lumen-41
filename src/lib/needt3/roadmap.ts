/**
 * The roadmap of one project: its tasks as milestones (stations) on a metro
 * line, in board order, with the waits between them as the track. Pure: tasks
 * (and, for the Agents view, hub items) in, stations, edges and lanes out.
 *
 * Nothing is stored. The four states are computed every time, the same way
 * the `needt:plan` skill computes them (skills/plan SKILL.md §3):
 *   - `done`    — the task is completed;
 *   - `blocked` — a task it waits on is still open: `dependsOnId`, or a line
 *                 `blocked by: <title>, <title>` in its notes (the skill writes
 *                 further blockers there, since a task holds one `dependsOnId`);
 *   - `current` — status `in_progress`, at most one: ties go to board order;
 *   - `next`    — open, not blocked, not current. The first of them is the
 *                 one to propose (`upNext`).
 *
 * Board order is the order the tasks were made in (the skill makes them in
 * milestone order), corrected so a task never comes before one it waits on.
 */

export type RoadmapState = "done" | "current" | "next" | "blocked";

/** The task fields the roadmap reads (a `V3Task` fits). */
export interface RoadmapTask {
  id: string;
  title: string;
  done: boolean;
  /** "todo" | "in_progress" | "completed". */
  status: string;
  projectId: string | null;
  /** `dependsOnId`. */
  blockedBy: string | null;
  notes: string | null;
  createdAt: string | null;
  /** "YYYY-MM-DD", local. */
  dueDate: string | null;
  deadline: string | null;
  parts?: readonly { done: boolean }[];
  /** A repeating task is a routine, not a milestone. */
  repeat?: string | null;
  trashedAt?: string | null;
}

/** A hub item as the Agents screen holds it (only what the roadmap reads). */
export interface RoadmapHubItem {
  id: string;
  title: string;
  /** open | claimed | in_progress | blocked | needs_owner | done | failed | cancelled */
  status: string;
  taskId?: string | null;
  /** Who works on it: the holder first, then the assignee; null = anyone. */
  agent: string | null;
  updatedAt?: string | null;
}

export interface RoadmapBlocker {
  id: string;
  title: string;
  done: boolean;
  /** The blocker belongs to another project. */
  outside: boolean;
}

export interface RoadmapStation {
  id: string;
  title: string;
  state: RoadmapState;
  /** The first `next` in board order: what to start when nothing is current. */
  upNext: boolean;
  /** A `next` station that is also in progress (only one can be current). */
  inProgress: boolean;
  /** Row (board order) and lane (column of the metro map). */
  row: number;
  lane: number;
  /** Every task it waits on, in this project or not, open or done. */
  waitsOn: RoadmapBlocker[];
  /** Subtasks done / total, or null without subtasks. */
  steps: { done: number; total: number } | null;
  /** The due date or deadline, "YYYY-MM-DD"; the deadline wins. */
  due: string | null;
  /** Hub items linked to this task, newest first. */
  hub: RoadmapHubItem[];
}

export interface RoadmapEdge {
  from: string;
  to: string;
  /**
   * `line`: the station waits on `from`; `seq`: it waits on nothing in the
   * map and only follows `from` in board order (drawn thinner, so the map
   * does not claim a wait that is not there); `wait`: a further blocker
   * joining from another lane.
   */
  kind: "line" | "seq" | "wait";
  /** The station at `from` is done: the track up to `to` has been travelled. */
  travelled: boolean;
}

export interface Roadmap {
  stations: RoadmapStation[];
  edges: RoadmapEdge[];
  lanes: number;
  current: RoadmapStation | null;
  upNext: RoadmapStation | null;
}

const BLOCKED_BY = /^\s*blocked by:\s*(.+)$/gim;

/** The text after each `blocked by:` line of a task's notes. */
export function blockedByLines(notes: string | null | undefined): string[] {
  if (!notes) return [];
  return [...notes.matchAll(BLOCKED_BY)]
    .map((m) => m[1].trim())
    .filter(Boolean);
}

/** Titles named on `blocked by:` lines, split on commas and semicolons. */
export function blockedByTitles(notes: string | null | undefined): string[] {
  return blockedByLines(notes).flatMap((line) =>
    line
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean)
  );
}

function norm(title: string) {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Tasks of `projectId` that are milestones: not repeating, not in the bin. */
export function milestonesOf<T extends RoadmapTask>(
  projectId: string,
  tasks: readonly T[]
): T[] {
  return tasks.filter(
    (t) => t.projectId === projectId && !t.repeat && !t.trashedAt
  );
}

/** Made-first order, ties broken by id so the map never shuffles. */
function byCreated(a: RoadmapTask, b: RoadmapTask) {
  const x = a.createdAt ?? "";
  const y = b.createdAt ?? "";
  if (x !== y) return x < y ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Build the roadmap of `projectId` from every task the person has (`all`, so
 * a blocker in another project still blocks) and, optionally, hub items.
 */
export function buildRoadmap(
  projectId: string,
  all: readonly RoadmapTask[],
  hubItems: readonly RoadmapHubItem[] = []
): Roadmap {
  const mine = milestonesOf(projectId, all).sort(byCreated);
  const byId = new Map(all.map((t) => [t.id, t] as const));
  const inMap = new Set(mine.map((t) => t.id));
  // Titles resolve to this project's tasks first, then to any other task.
  const byTitle = new Map<string, RoadmapTask>();
  for (const t of [...mine, ...all])
    if (!t.trashedAt && !byTitle.has(norm(t.title)))
      byTitle.set(norm(t.title), t);

  // Every task each milestone waits on: dependsOnId first, then the notes.
  const waits = new Map<string, RoadmapTask[]>();
  for (const t of mine) {
    const list: RoadmapTask[] = [];
    const seen = new Set<string>([t.id]);
    const add = (b: RoadmapTask | undefined) => {
      if (!b || seen.has(b.id) || b.trashedAt) return;
      seen.add(b.id);
      list.push(b);
    };
    if (t.blockedBy) add(byId.get(t.blockedBy));
    // A whole line can be one title with a comma in it ("Pricing, tiers").
    for (const line of blockedByLines(t.notes)) {
      const whole = byTitle.get(norm(line));
      if (whole) add(whole);
      else
        for (const title of line.split(/[,;]/))
          if (title.trim()) add(byTitle.get(norm(title)));
    }
    waits.set(t.id, list);
  }

  // Board order: made-first, a blocker in this project always before the
  // tasks that wait on it. A loop (the server refuses one through
  // dependsOnId, but notes can say anything) cannot hang the map.
  const order: RoadmapTask[] = [];
  const placed = new Set<string>();
  const visiting = new Set<string>();
  const place = (t: RoadmapTask) => {
    if (placed.has(t.id) || visiting.has(t.id)) return;
    visiting.add(t.id);
    for (const b of waits.get(t.id) ?? []) if (inMap.has(b.id)) place(b);
    visiting.delete(t.id);
    if (placed.has(t.id)) return;
    placed.add(t.id);
    order.push(t);
  };
  for (const t of mine) place(t);

  // Hub items per task, newest first.
  const hub = new Map<string, RoadmapHubItem[]>();
  for (const item of hubItems) {
    if (!item.taskId || !inMap.has(item.taskId)) continue;
    const list = hub.get(item.taskId) ?? [];
    list.push(item);
    hub.set(item.taskId, list);
  }
  for (const list of hub.values())
    list.sort((a, b) => ((a.updatedAt ?? "") < (b.updatedAt ?? "") ? 1 : -1));

  // States.
  let currentId: string | null = null;
  let upNextId: string | null = null;
  const working = new Set<string>();
  const state = new Map<string, RoadmapState>();
  for (const t of order) {
    if (t.done) {
      state.set(t.id, "done");
      continue;
    }
    if ((waits.get(t.id) ?? []).some((b) => !b.done)) {
      state.set(t.id, "blocked");
      continue;
    }
    if (t.status === "in_progress" && !currentId) {
      currentId = t.id;
      state.set(t.id, "current");
      continue;
    }
    state.set(t.id, "next");
    // a second task in progress is not the one to propose starting
    if (t.status === "in_progress") working.add(t.id);
    else if (!upNextId) upNextId = t.id;
  }

  // Lanes. A station takes the lane its first in-map blocker ends; when that
  // lane has moved on (a second task waits on the same blocker) it forks a
  // new lane. A station that waits on nothing in the map follows the main
  // line. Lanes are never reused, so a lane's track never crosses a station.
  const tails: (string | null)[] = [null];
  const laneOf = new Map<string, number>();
  const edges: RoadmapEdge[] = [];
  const stations: RoadmapStation[] = order.map((t, row) => {
    const inside = (waits.get(t.id) ?? []).filter((b) => inMap.has(b.id));
    const first = inside[0];
    let lane: number;
    let from: string | null;
    let kind: RoadmapEdge["kind"] = "line";
    if (first) {
      const at = tails.indexOf(first.id);
      if (at >= 0) lane = at;
      else {
        lane = tails.length;
        tails.push(null);
      }
      from = first.id;
    } else {
      lane = 0;
      from = tails[0];
      kind = "seq";
    }
    tails[lane] = t.id;
    laneOf.set(t.id, lane);
    if (from)
      edges.push({
        from,
        to: t.id,
        kind,
        travelled: byId.get(from)?.done ?? false,
      });
    for (const b of inside.slice(1))
      edges.push({ from: b.id, to: t.id, kind: "wait", travelled: b.done });

    const parts = t.parts ?? [];
    return {
      id: t.id,
      title: t.title,
      state: state.get(t.id) ?? "next",
      upNext: t.id === upNextId,
      inProgress: working.has(t.id),
      row,
      lane,
      waitsOn: (waits.get(t.id) ?? []).map((b) => ({
        id: b.id,
        title: b.title,
        done: b.done,
        outside: !inMap.has(b.id),
      })),
      steps: parts.length
        ? { done: parts.filter((p) => p.done).length, total: parts.length }
        : null,
      due: t.deadline ?? t.dueDate ?? null,
      hub: hub.get(t.id) ?? [],
    };
  });

  return {
    stations,
    edges,
    lanes: tails.length,
    current: stations.find((s) => s.id === currentId) ?? null,
    upNext: stations.find((s) => s.id === upNextId) ?? null,
  };
}

/** "Waiting on Billing and Onboarding" — the open blockers, by name. */
export function waitingLine(s: Pick<RoadmapStation, "waitsOn">) {
  const open = s.waitsOn.filter((b) => !b.done).map((b) => b.title);
  if (!open.length) return null;
  if (open.length === 1) return `Waiting on ${open[0]}`;
  return `Waiting on ${open.slice(0, -1).join(", ")} and ${open.at(-1)}`;
}

/** The plain words for a state, the same marks the plan skill uses. */
export const STATE_LABEL: Record<RoadmapState, string> = {
  done: "Done",
  current: "Now",
  next: "Next",
  blocked: "Blocked",
};

/** What a hub item's status reads as on the map. */
export function hubStatusLabel(status: string) {
  switch (status) {
    case "open":
      return "waiting for an agent";
    case "claimed":
    case "in_progress":
      return "working";
    case "blocked":
      return "blocked";
    case "needs_owner":
      return "needs you";
    case "done":
      return "done";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return status.replace(/_/g, " ");
  }
}
