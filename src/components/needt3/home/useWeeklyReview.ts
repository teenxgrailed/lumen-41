"use client";

import { type ComponentProps, useCallback, useMemo, useState } from "react";

import type { Stats } from "@/services/stats/home-stats";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { addDays } from "@/lib/needt3/derive";
import { fetchJson, sendJson } from "@/lib/needt3/hooks/core";
import { useSettings } from "@/lib/needt3/hooks/settings";
import { useUpdateTask } from "@/lib/needt3/hooks/tasks";
import { useSaveWeekFocus } from "@/lib/needt3/hooks/week-focus";
import type { V3Project, V3Task } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";
import { weekNumber } from "@/lib/needt3/today";
import { nextWeekStart, weekStartOf } from "@/lib/needt3/week-focus";
import { notify } from "@/lib/notifications";

import { dur } from "./derive";
import { type LeftoverTarget, leftoverPatch, shutdownOf } from "./finish";
import type { HaReview } from "./ha";
import { dayFlag, setDayFlag } from "./nudge";
import {
  focusItems,
  focusOptions,
  isReviewDay,
  reviewMarkdown,
  reviewTitle,
  weekRangeLabel,
  winsLines,
} from "./review";

const NS = "weekly.review";

interface PageRow {
  id: string;
  title: string;
  trashedAt?: string | null;
}

/**
 * The Sunday review: whether it is offered (Sunday, not yet written this week,
 * not put off today), its state, and saving it as a page (not Private) in the
 * person's documents ("Weekly review · 19 October 2026"), which is theirs to
 * read through the pages API like any other. Leftovers move as in End day.
 */
export function useWeeklyReview(o: {
  today: string;
  late: readonly V3Task[];
  day: readonly V3Task[];
  stats: Stats | undefined;
  /** Every task, for the focus picker. */
  tasks: readonly V3Task[];
  projects: readonly V3Project[];
  /** Days in a row with something closed. */
  streak: number;
}) {
  const qc = useQueryClient();
  const updateTask = useUpdateTask();
  const saveWeekFocus = useSaveWeekFocus();
  const weekStartDay = useSettings().data?.weekStartDay ?? "monday";
  const title = reviewTitle(o.today);
  const sunday = isReviewDay(o.today);
  const written = useQuery({
    queryKey: qk.weeklyReview(title),
    queryFn: async () => (await findByTitle(title)) != null,
    enabled: sunday,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const [open, setOpen] = useState(false);
  const [, bump] = useState(0);
  const [choices, setChoices] = useState<Record<string, LeftoverTarget>>({});
  const [date, setDate] = useState(addDays(o.today, 2));
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const shut = useMemo(() => shutdownOf(o.late, o.day), [o.late, o.day]);
  const wins = useMemo(() => winsLines(o.stats), [o.stats]);
  const options = useMemo(
    () => focusOptions(o.tasks, o.projects, o.today),
    [o.tasks, o.projects, o.today]
  );

  const show =
    sunday &&
    written.isFetched &&
    written.data === false &&
    !dayFlag(NS, o.today);

  const submit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const plan = shut.leftovers.map((t) => ({
        t,
        target: choices[t.id] ?? "tomorrow",
      }));
      const settled = await Promise.allSettled(
        plan.map(({ t, target }) =>
          updateTask.mutateAsync({
            id: t.id,
            patch: leftoverPatch(t, target, o.today, date),
          })
        )
      );
      const moved = plan.flatMap((p, i) => {
        const r = settled[i];
        return r && r.status === "fulfilled"
          ? [
              {
                title: p.t.title,
                to:
                  p.target === "inbox"
                    ? "Inbox"
                    : p.target === "date"
                      ? date
                      : "Monday",
                undo: r.value.undo,
              },
            ]
          : [];
      });
      const { page } = await sendJson<{ page: PageRow }>("/api/pages", "POST", {
        title,
        // not private: the assistant never reads a Private page. Turn Private
        // on per page.
        isPrivate: false,
      });
      await sendJson(`/api/pages/${page.id}/append`, "POST", {
        text: reviewMarkdown({
          wins,
          moved,
          focuses: focusItems(options, picked).map((f) => f.title),
        }),
      });
      // the focuses are also the week's highlight candidates (/api/week-focus)
      const chosen = focusItems(options, picked);
      if (chosen.length)
        await saveWeekFocus(nextWeekStart(o.today, weekStartDay), chosen);
      qc.setQueryData(qk.weeklyReview(title), true);
      void qc.invalidateQueries({ queryKey: qk.docs() });
      notify.success(
        moved.length ? `Review saved · ${moved.length} moved` : "Review saved",
        moved.length
          ? {
              action: {
                label: "Undo",
                onClick: () =>
                  void Promise.allSettled(moved.map((m) => m.undo())),
              },
            }
          : undefined
      );
      setOpen(false);
    } catch {
      notify.error("Could not save the review.");
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    shut,
    choices,
    updateTask,
    o.today,
    date,
    title,
    wins,
    options,
    picked,
    qc,
    saveWeekFocus,
    weekStartDay,
  ]);

  const first = weekStartOf(o.today, weekStartDay);
  const next = nextWeekStart(o.today, weekStartDay);
  const week = o.stats;
  const sheet: ComponentProps<typeof HaReview> = {
    title: `Week ${weekNumber(first, weekStartDay)} in review`,
    sub: `Sunday · ${weekRangeLabel(first)}`,
    wins:
      week && week.total > 0
        ? [
            {
              b: String(week.total),
              span: week.total === 1 ? "task done" : "tasks done",
            },
            ...(week.focusMinutes != null
              ? [{ b: dur(week.focusMinutes) || "0 min", span: "focused" }]
              : []),
            ...(o.streak > 0
              ? [{ b: String(o.streak), span: "day streak" }]
              : []),
          ]
        : [],
    winLines: wins.filter((l) => !/ done$/.test(l) && !/ of focus$/.test(l)),
    leftovers: shut.leftovers.map((t) => ({
      id: t.id,
      title: t.title,
      meta: t.dueDate && t.dueDate < o.today ? "Overdue" : "This week",
    })),
    moves: choices,
    date,
    minDate: addDays(o.today, 1),
    options,
    picked,
    nextWeek: weekNumber(next, weekStartDay),
    busy,
    onMove: (id, target) => setChoices((c) => ({ ...c, [id]: target })),
    onDate: setDate,
    onPick: (key) =>
      setPicked((p) =>
        p.includes(key)
          ? p.filter((x) => x !== key)
          : p.length < 3
            ? [...p, key]
            : p
      ),
    onSubmit: () => void submit(),
    onClose: () => setOpen(false),
  };

  return {
    show,
    open,
    start: () => setOpen(true),
    later: () => {
      setDayFlag(NS, o.today);
      bump((n) => n + 1);
    },
    sheet,
  };
}

async function findByTitle(title: string): Promise<string | null> {
  const { pages } = await fetchJson<{ pages: PageRow[] }>(
    `/api/pages?preview=false&q=${encodeURIComponent(title)}`
  );
  return pages.find((p) => p.title === title && !p.trashedAt)?.id ?? null;
}
