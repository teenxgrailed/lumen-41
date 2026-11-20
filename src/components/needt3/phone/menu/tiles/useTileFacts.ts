"use client";

import { useMemo } from "react";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { liveHabits } from "@/lib/needt3/derive";
import { useHabits } from "@/lib/needt3/hooks/habits";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { useTasks } from "@/lib/needt3/hooks/tasks";

import { dayStreak } from "../../../home/derive";
import { useFocusRun } from "../../../focus/useFocusController";
import { dockLabel } from "../FocusDockButton";
import type { MenuCounts } from "../status";
import type { TileFacts } from "./model";

/**
 * What the tiles show beyond the shared counts: the running focus session,
 * the streak, a habit's own colour and the projects. Read from the queries the
 * app already holds (no route of its own), and only while the tile menu is on
 * screen: the focus clock ticks every second.
 */
export function useTileFacts(counts: MenuCounts): TileFacts {
  const { run } = useFocusRun();
  const tasks = useTasks().data;
  const habits = useHabits().data;
  const projects = useProjects().data;
  const tz = useTimeZone();

  return useMemo(() => {
    const today = formatInTimeZone(newDate(), tz, "yyyy-MM-dd");
    const open = new Map<string, number>();
    for (const t of tasks ?? [])
      if (!t.done && t.projectId)
        open.set(t.projectId, (open.get(t.projectId) ?? 0) + 1);
    const byProject = new Map<
      string,
      { name: string; hue: string | null; open: number }
    >();
    for (const p of projects ?? [])
      if (!p.archived && !p.trashedAt)
        byProject.set(p.id, {
          name: p.name,
          hue: p.color,
          open: open.get(p.id) ?? 0,
        });
    const live = habits ? liveHabits(habits) : [];
    return {
      counts,
      focus: run
        ? {
            label: /^\d+$/.test(dockLabel(run))
              ? `${dockLabel(run)} min`
              : dockLabel(run),
            pct: run.pct,
            paused: run.paused,
          }
        : null,
      streak: tasks ? dayStreak(tasks, today).n : undefined,
      habitHue: live[0]?.color ?? null,
      projects: byProject,
    };
  }, [counts, run, tasks, habits, projects, tz]);
}
