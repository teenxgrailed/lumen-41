"use client";

import { addedLabel, createDraft } from "@/lib/needt3/day";
import { useCreateTask } from "@/lib/needt3/hooks/tasks";
import type { V3Task } from "@/lib/needt3/map";

import { snack } from "../overlays/snack";
import { usePhoneOverlays } from "../overlays/store";
import { taskHits } from "./model";

/**
 * The pull-down of the task screens (phone-kit.jsx `pkTaskPull`): search the
 * tasks, open a hit in the task sheet, Enter adds a task to today (through
 * `useCreateTask`, with an Undo in the toast).
 */
export function useTaskPull(tasks: readonly V3Task[], today: string) {
  const createTask = useCreateTask();
  const openTask = usePhoneOverlays((s) => s.openTask);
  const add = async (text: string) => {
    const title = text.trim();
    if (!title) return;
    try {
      const { result, undo } = await createTask.mutateAsync({
        draft: createDraft({ title }, today),
      });
      snack(result ? addedLabel(result, today) : "Added to today", undo);
    } catch {
      // the mutation already told the person
    }
  };
  return {
    search: (q: string) => taskHits(tasks, q, today),
    onPick: (hit: { id: string }) =>
      openTask(tasks.find((t) => t.id === hit.id) ?? hit.id),
    onAdd: (text: string) => void add(text),
  };
}
