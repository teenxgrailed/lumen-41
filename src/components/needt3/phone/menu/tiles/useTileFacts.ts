"use client";

import { useMemo } from "react";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { habitDoneOn, liveHabits } from "@/lib/needt3/derive";
import { useDocs } from "@/lib/needt3/hooks/docs";
import { useEvents } from "@/lib/needt3/hooks/events";
import { useCheckins, useHabits } from "@/lib/needt3/hooks/habits";
import { useMail } from "@/lib/needt3/hooks/mail";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { useTasks } from "@/lib/needt3/hooks/tasks";

import { useFocusRun } from "../../../focus/useFocusController";
import { dayStreak } from "../../../home/derive";
import { dockLabel } from "../FocusDockButton";
import { agoLabel } from "../counts";
import type { MenuCounts } from "../status";
import {
  type TileFacts,
  dayEvents,
  mailRows,
  todayRows,
  weekDots,
} from "./model";

/**
 * What the tiles show, read from the queries the app already holds (the same
 * ones the rail and the Today screen read, no route of its own): the next
 * tasks and events, today's habits, the newest mail and documents, a project's
 * open work, the week's closed days and the running focus session. Only while
 * the tile menu is on screen: the focus clock ticks every second.
 */
export function useTileFacts(counts: MenuCounts): TileFacts {
  const { run } = useFocusRun();
  const tasks = useTasks().data;
  const habits = useHabits().data;
  const checkins = useCheckins().data;
  const projects = useProjects().data;
  const events = useEvents().data;
  const mail = useMail("inbox").data;
  const docs = useDocs().data;
  const tz = useTimeZone();

  return useMemo(() => {
    const d = newDate();
    const stamp = formatInTimeZone(d, tz, "yyyy-MM-dd'T'HH:mm");
    const today = stamp.slice(0, 10);

    const open = new Map<string, number>();
    const titles = new Map<string, string[]>();
    for (const t of tasks ?? [])
      if (!t.done && !t.trashedAt && t.projectId) {
        open.set(t.projectId, (open.get(t.projectId) ?? 0) + 1);
        const list = titles.get(t.projectId) ?? [];
        if (list.length < 9) list.push(t.title || "Untitled");
        titles.set(t.projectId, list);
      }
    const byProject = new Map<
      string,
      { name: string; hue: string | null; open: number; titles: string[] }
    >();
    for (const p of projects ?? [])
      if (!p.archived && !p.trashedAt)
        byProject.set(p.id, {
          name: p.name,
          hue: p.color,
          open: open.get(p.id) ?? 0,
          titles: titles.get(p.id) ?? [],
        });

    const live = habits ? liveHabits(habits) : [];
    const liveDocs = (docs ?? []).filter((x) => !x.trashedAt).slice(0, 3);
    const nowMs = d.getTime();

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
      week: tasks ? weekDots(tasks, today) : undefined,
      habitHue: live[0]?.color ?? null,
      projects: byProject,
      today: tasks ? todayRows(tasks, today) : undefined,
      events: events ? dayEvents(events, stamp) : undefined,
      nowMin: Number(stamp.slice(11, 13)) * 60 + Number(stamp.slice(14, 16)),
      habitRows: habits
        ? live.map((h) => ({
            id: h.id,
            title: h.title,
            color: h.color,
            done: checkins ? habitDoneOn(h.id, today, checkins) : false,
          }))
        : undefined,
      inboxTitles: tasks
        ? tasks
            .filter(
              (t) =>
                !t.done &&
                !t.isFixed &&
                !t.noSlot &&
                !t.scheduledStart &&
                !t.trashedAt
            )
            .slice(0, 3)
            .map((t) => t.title || "Untitled")
        : undefined,
      mailRows: mail ? mailRows(mail) : undefined,
      docs: docs ? liveDocs : undefined,
      docsAgo: new Map(
        liveDocs.map((x) => [
          x.id,
          x.updatedAt ? agoLabel(nowMs - newDate(x.updatedAt).getTime()) : "",
        ])
      ),
    };
  }, [counts, run, tasks, habits, checkins, projects, events, mail, docs, tz]);
}
