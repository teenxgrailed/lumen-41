"use client";

import { useEffect, useMemo, useState } from "react";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { useBoards } from "@/lib/needt3/hooks/boards";
import { useConnections } from "@/lib/needt3/hooks/connections";
import { useDocs } from "@/lib/needt3/hooks/docs";
import { useEvents } from "@/lib/needt3/hooks/events";
import { useCheckins, useHabits } from "@/lib/needt3/hooks/habits";
import { useMail } from "@/lib/needt3/hooks/mail";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { useTasks } from "@/lib/needt3/hooks/tasks";

import { buildMenuCounts } from "./counts";
import type { MenuCounts } from "./status";

/** The person's local stamp, re-read once a minute, on the minute. */
function useNowStamp(timeZone: string) {
  const read = () => {
    const d = newDate();
    return {
      stamp: formatInTimeZone(d, timeZone, "yyyy-MM-dd'T'HH:mm"),
      ms: d.getTime(),
    };
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    let t = 0;
    const tick = () => {
      setNow(read());
      t = window.setTimeout(tick, 60_000 - (newDate().getTime() % 60_000) + 50);
    };
    tick();
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeZone]);
  return now;
}

/**
 * What menu A's rows and tile marks say, from the data the app already
 * loads (the same queries the desktop rail reads; TanStack shares them).
 */
export function usePhoneCounts(): MenuCounts {
  const timeZone = useTimeZone();
  const now = useNowStamp(timeZone);
  const tasks = useTasks();
  const mail = useMail("inbox");
  const events = useEvents();
  const docs = useDocs();
  const boards = useBoards();
  const projects = useProjects();
  const habits = useHabits();
  const checkins = useCheckins();
  const connections = useConnections();

  const docEditedMs = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs.data ?? [])
      if (d.updatedAt) m.set(d.id, newDate(d.updatedAt).getTime());
    return m;
  }, [docs.data]);

  return useMemo(
    () =>
      buildMenuCounts({
        now: now.stamp,
        nowMs: now.ms,
        tasks: tasks.data,
        mail: mail.data,
        events: events.data,
        docs: docs.data,
        docEditedMs,
        boards: boards.data,
        projects: projects.data,
        habits: habits.data,
        checkins: checkins.data,
        connections: connections.data,
      }),
    [
      now,
      tasks.data,
      mail.data,
      events.data,
      docs.data,
      docEditedMs,
      boards.data,
      projects.data,
      habits.data,
      checkins.data,
      connections.data,
    ]
  );
}
