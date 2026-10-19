"use client";

import { type ComponentProps, useCallback, useMemo, useState } from "react";

import { addDays } from "@/lib/needt3/derive";
import { useDailyNote } from "@/lib/needt3/hooks/daily-note";
import { useUpdateTask } from "@/lib/needt3/hooks/tasks";
import type { V3Task } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

import { dayOf, dur } from "./derive";
import {
  type FinishPick,
  type LeftoverTarget,
  doTodayPatch,
  leftoverPatch,
  shutdownOf,
  tomorrowNote,
} from "./finish";
import type { HaEndDay } from "./ha";
import { setNudgeOff } from "./nudge";
import { weekdayLong, weekdayOf } from "./stats-model";

const metaOf = (t: V3Task, today: string): string => {
  const d = dayOf(t, today);
  const bits = [d && d < today ? "Overdue" : "Today"];
  const est = dur(t.estimatedMinutes);
  if (est) bits.push(est);
  return bits.join(" · ");
};

/**
 * The finished day's two actions, for either face: "Do today" on a pick, and
 * the End day sheet (its state, the moves and the note). The face draws; this
 * writes.
 */
export function useFinishDay({
  late,
  day,
  today,
}: {
  late: readonly V3Task[];
  day: readonly V3Task[];
  today: string;
}) {
  const updateTask = useUpdateTask();
  const tomorrow = addDays(today, 1);
  const tomorrowNoteRef = useDailyNote(tomorrow);
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<Record<string, LeftoverTarget>>({});
  const [date, setDate] = useState(addDays(today, 2));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const shut = useMemo(() => shutdownOf(late, day), [late, day]);

  const doToday = useCallback(
    async (pick: FinishPick) => {
      try {
        const { undo } = await updateTask.mutateAsync({
          id: pick.task.id,
          patch: doTodayPatch(pick.task, today),
        });
        notify.success("Added to today", {
          action: { label: "Undo", onClick: () => void undo() },
        });
      } catch {
        // the mutation already told the person
      }
    },
    [updateTask, today]
  );

  const close = useCallback(() => setOpen(false), []);
  const show = useCallback(() => {
    setChoices({});
    setNote("");
    setOpen(true);
  }, []);

  const submit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const moves = shut.leftovers.map((t) => ({
        t,
        target: choices[t.id] ?? "tomorrow",
      }));
      const settled = await Promise.allSettled(
        moves.map(({ t, target }) =>
          updateTask.mutateAsync({
            id: t.id,
            patch: leftoverPatch(t, target, today, date),
          })
        )
      );
      const moved = settled.flatMap((r) =>
        r.status === "fulfilled" ? [r.value] : []
      );
      const text = tomorrowNote(note);
      const saved = text ? await tomorrowNoteRef.append(text) : true;
      const parts = [
        moved.length
          ? `${moved.length} ${moved.length === 1 ? "task" : "tasks"} moved`
          : "",
        text && saved ? "note saved" : "",
      ].filter(Boolean);
      notify.success(
        parts.length ? `Day ended · ${parts.join(", ")}` : "Day ended",
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
      if (saved) {
        setNudgeOff(today);
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, shut, choices, updateTask, today, date, note, tomorrowNoteRef]);

  const sheet: ComponentProps<typeof HaEndDay> = {
    title: `End of ${weekdayLong(weekdayOf(today))}`,
    summary: [
      `${shut.done.length} done`,
      shut.leftovers.length ? `${shut.leftovers.length} left` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    done: shut.done.map((t) => t.title),
    leftovers: shut.leftovers.map((t) => ({
      id: t.id,
      title: t.title,
      meta: metaOf(t, today),
    })),
    moves: choices,
    date,
    minDate: tomorrow,
    note,
    busy,
    onMove: (id, target) => setChoices((c) => ({ ...c, [id]: target })),
    onDate: setDate,
    onNote: setNote,
    onSubmit: () => void submit(),
    onClose: close,
  };

  return { open, show, close, doToday, sheet };
}
