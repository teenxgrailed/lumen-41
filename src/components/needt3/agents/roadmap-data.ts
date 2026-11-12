/**
 * What Agents → Roadmap reads from the hub: who works on each item and which
 * projects have agents' work on them. Pure, so it is tested without a screen.
 */
import type { V3Project, V3Task } from "@/lib/needt3/map";
import { type RoadmapHubItem, milestonesOf } from "@/lib/needt3/roadmap";

import type { HubItemRow } from "./TasksTab";

/** A hub item as the roadmap reads it: who works on it, and on which task. */
export function hubForRoadmap(items: readonly HubItemRow[]): RoadmapHubItem[] {
  return items.map((i) => ({
    id: i.id,
    title: i.title,
    status: i.status,
    taskId: i.taskId ?? null,
    agent:
      i.heldBy?.name ??
      (i.assignee && i.assignee !== "any" ? (i.assignee.name ?? null) : null),
    updatedAt: i.updatedAt,
  }));
}

/**
 * The projects worth a roadmap, agents' work first: a project with a hub item
 * on it (or on one of its tasks) leads, newest activity first; then every
 * other project that has tasks, in the person's order.
 */
export function roadmapProjects(
  projects: readonly V3Project[],
  tasks: readonly V3Task[],
  items: readonly HubItemRow[]
): V3Project[] {
  const projectOfTask = new Map(tasks.map((t) => [t.id, t.projectId]));
  const latest = new Map<string, string>();
  for (const i of items) {
    // the task's own project wins: that is where the item shows on the map
    const pid =
      (i.taskId ? projectOfTask.get(i.taskId) : null) ?? i.projectId ?? null;
    if (!pid) continue;
    const at = i.updatedAt ?? "";
    if (!latest.has(pid) || (latest.get(pid) ?? "") < at) latest.set(pid, at);
  }
  const live = projects.filter(
    (p) => !p.archived && milestonesOf(p.id, tasks).length > 0
  );
  const withHub = live
    .filter((p) => latest.has(p.id))
    .sort((a, b) =>
      (latest.get(a.id) ?? "") < (latest.get(b.id) ?? "") ? 1 : -1
    );
  return [...withHub, ...live.filter((p) => !latest.has(p.id))];
}
