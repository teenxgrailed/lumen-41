"use client";

import { useEffect, useMemo, useState } from "react";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { budgetNavItem } from "@/lib/needt3/budget";
import { useAgentHubNav } from "@/lib/needt3/hooks/agent-hub";
import { useBoards } from "@/lib/needt3/hooks/boards";
import { useBudgetNav } from "@/lib/needt3/hooks/budget";
import { useConnections } from "@/lib/needt3/hooks/connections";
import { usePlanPickIds } from "@/lib/needt3/hooks/day-plan";
import { useDocs } from "@/lib/needt3/hooks/docs";
import { useEvents } from "@/lib/needt3/hooks/events";
import { useCheckins, useHabits } from "@/lib/needt3/hooks/habits";
import { useMail } from "@/lib/needt3/hooks/mail";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useSettings, useTimeZone } from "@/lib/needt3/hooks/settings";
import { useTasks } from "@/lib/needt3/hooks/tasks";
import { learnNavItem } from "@/lib/needt3/learn";
import { isPro } from "@/lib/needt3/paywall";

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
  const agentHub = useAgentHubNav();
  const budgetNav = useBudgetNav();
  const plan = usePlan();
  const planPicks = usePlanPickIds(now.stamp.slice(0, 10));
  const settings = useSettings();
  const budget = budgetNavItem({
    enabled: budgetNav.enabled,
    pro: plan.data ? isPro(plan.data.kind) : undefined,
    prefs: settings.data?.prefs,
  });
  const budgetLocked = budget ? budget.locked : null;
  const learn = learnNavItem({
    pro: plan.data ? isPro(plan.data.kind) : undefined,
  });
  const learnLocked = learn ? learn.locked : null;

  const docEditedMs = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs.data ?? [])
      if (d.updatedAt) m.set(d.id, newDate(d.updatedAt).getTime());
    return m;
  }, [docs.data]);

  return useMemo(
    () => ({
      ...buildMenuCounts({
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
        planPicks,
      }),
      ...(agentHub.enabled ? { agents: { unread: agentHub.unread } } : {}),
      ...(budgetLocked === null ? {} : { budget: { locked: budgetLocked } }),
      ...(learnLocked === null ? {} : { learn: { locked: learnLocked } }),
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
      planPicks,
      agentHub.enabled,
      agentHub.unread,
      budgetLocked,
      learnLocked,
    ]
  );
}
