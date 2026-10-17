"use client";

import { useState } from "react";

import { create } from "zustand";

import { dayLabel, moveDay } from "@/lib/needt3/derive";
import { useTrashTask, useUpdateTask } from "@/lib/needt3/hooks/tasks";
import type { V3Task } from "@/lib/needt3/map";

import { PkButton, PkSheet } from "../kit";
import { snack } from "./snack";
import { usePkToday } from "./today";

const none = () => undefined;

/** The task whose Schedule sheet is open (a row's swipe-left button sets it). */
export const useScheduleSheet = create<{
  task: V3Task | null;
  open: (t: V3Task) => void;
  close: () => void;
}>()((set) => ({
  task: null,
  open: (task) => set({ task }),
  close: () => set({ task: null }),
}));

/** The quick answers, in the words `toDate` understands. */
export const SCHEDULE_CHOICES = [
  "Today",
  "Tomorrow",
  "This weekend",
  "Next week",
] as const;

/**
 * Schedule: a few quick days and a date field, in a sheet. Moves the task's
 * day and keeps its hour (`moveDay`); one Undo puts it back. The sheet is for
 * a task already on the screen, so it never reads the server.
 */
export function ScheduleSheet() {
  const task = useScheduleSheet((s) => s.task);
  const close = useScheduleSheet((s) => s.close);
  const today = usePkToday();
  const update = useUpdateTask();
  const [picked, setPicked] = useState("");

  const apply = (day: string) => {
    if (!task) return;
    const t = task;
    close();
    setPicked("");
    update
      .mutateAsync({ id: t.id, patch: moveDay(t, day, today) })
      .then(({ undo }) => {
        const d = moveDay(t, day, today).dueDate;
        snack(`Scheduled for ${dayLabel(d) ?? "that day"}`, undo);
      }, none);
  };

  return (
    <PkSheet
      open={!!task}
      onClose={() => {
        close();
        setPicked("");
      }}
      title="Schedule"
      meta={task?.title}
      label="Schedule the task"
    >
      <div className="pk-schedule" data-pk-schedule="">
        {SCHEDULE_CHOICES.map((c) => (
          <PkButton key={c} block onClick={() => apply(c)}>
            {c}
          </PkButton>
        ))}
        <label className="pk-schedule-pick">
          <span>Pick a date</span>
          <input
            type="date"
            value={picked}
            min={today}
            onChange={(e) => {
              setPicked(e.target.value);
              if (e.target.value) apply(e.target.value);
            }}
          />
        </label>
      </div>
    </PkSheet>
  );
}

/**
 * What a task row's swipe-left buttons do: Schedule opens the sheet above,
 * Delete moves the task to Trash (Undo restores it). The row has already
 * thrown itself off the edge; `leave` plays the exit and writes (usePkExit).
 */
export function useTaskActions(leave: (t: V3Task, kind: "trash") => void) {
  const open = useScheduleSheet((s) => s.open);
  return (t: V3Task) => ({
    onSchedule: () => open(t),
    onDelete: () => leave(t, "trash"),
  });
}

/** Trash a task, with the Undo that restores it. */
export function useTrashWithUndo() {
  const trash = useTrashTask();
  return (t: V3Task) =>
    trash.trash(t.id).then(({ undo }) => snack("Moved to Trash", undo), none);
}
