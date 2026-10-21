"use client";

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useNeedtReducedMotion } from "@/components/providers/MotionRuntime";

import { haptic } from "@/lib/native";
import { useTaskView } from "@/lib/needt3/hooks/task-view";
import { useToggleTask } from "@/lib/needt3/hooks/tasks";
import type { V3Task } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

/**
 * THE COMPLETION — what happens on screen when a task is ticked. One shared
 * primitive; no screen draws its own.
 *
 *   strike   the box pops and fills, the title is struck through (CSS, from
 *            `phase`); the write has already gone out
 *   collapse (Completed tasks: hide) after STRIKE_HOLD_MS the row folds away
 *            and its neighbours slide up
 *
 * With Completed tasks set to keep, the row simply stays struck where it is
 * until the screen is left, and then lands in Done like any closed task.
 * Under reduced motion there is no phase at all: the row leaves (or lands in
 * Done) at once.
 *
 * A screen creates one with `useCompletion()`, offers it to the rows below
 * with `<CompletionScope>` (a `<Task>` reads it, so no row is wired by hand)
 * and draws its lists from `hold(tasks)`: a task still playing its exit reads
 * as open, so it stays in its place until the fold is done.
 */
export type CompletionPhase = "strike" | "collapse";

/** How long a struck row is held before it folds away (Completed: hide). */
export const STRIKE_HOLD_MS = 1000;
/** The fold itself; the row is gone when it ends. */
export const FOLD_MS = 320;

type Closable = Pick<V3Task, "id" | "done" | "title">;

const none = () => undefined;

function without<T>(m: Record<string, T>, id: string) {
  if (!(id in m)) return m;
  const next = { ...m };
  delete next[id];
  return next;
}

export function useCompletion() {
  const { completed } = useTaskView();
  const toggle = useToggleTask();
  const reduced = useNeedtReducedMotion();
  const [phase, setPhase] = useState<Record<string, CompletionPhase>>({});
  const timers = useRef<Record<string, number[]>>({});
  const live = useRef({ completed, toggle, reduced, phase });
  live.current = { completed, toggle, reduced, phase };

  const clear = useCallback((id: string) => {
    (timers.current[id] ?? []).forEach((t) => window.clearTimeout(t));
    delete timers.current[id];
  }, []);
  useEffect(() => {
    const all = timers.current;
    return () => Object.values(all).forEach((l) => l.forEach(clearTimeout));
  }, []);
  const drop = useCallback(
    (id: string) => {
      clear(id);
      setPhase((m) => without(m, id));
    },
    [clear]
  );

  /**
   * Tick or untick. The write goes out first, always (optimistic, one Undo);
   * the row's exit is only the page catching up. Ticking a closed task
   * reopens it at once. `also.undo` is run after the task's own undo (the
   * last step ticked to close it is put back with it).
   */
  const check = useCallback(
    (t: Closable, also?: { undo?: () => Promise<void> }) => {
      const {
        completed: mode,
        toggle: write,
        reduced: calm,
        phase: playing,
      } = live.current;
      // already ticked and still on its way out: a second tick is not a reopen
      if (!t.done && playing[t.id]) return;
      clear(t.id);
      if (t.done) {
        drop(t.id);
        void write
          .toggle(t)
          .then(({ undo }) =>
            notify.success(`Reopened “${t.title}”`, {
              action: { label: "Undo", onClick: () => void undo() },
            })
          )
          .catch(none);
        return;
      }
      void haptic("success");
      if (!calm) {
        setPhase((m) => ({ ...m, [t.id]: "strike" }));
        if (mode === "hide")
          timers.current[t.id] = [
            window.setTimeout(
              () =>
                setPhase((m) => (m[t.id] ? { ...m, [t.id]: "collapse" } : m)),
              STRIKE_HOLD_MS
            ),
            window.setTimeout(() => drop(t.id), STRIKE_HOLD_MS + FOLD_MS),
          ];
      }
      void write
        .toggle(t)
        .then(({ undo }) =>
          notify.success(`Done · “${t.title}”`, {
            action: {
              label: "Undo",
              onClick: () => {
                drop(t.id);
                // closed by its last step: the step is unticked with it
                void undo().then(() => also?.undo?.());
              },
            },
          })
        )
        // the mutation put the old fields back and told the person
        .catch(() => drop(t.id));
    },
    [clear, drop]
  );

  /** A list with the rows still playing their exit counted as open. */
  const hold = useCallback(
    <T extends { id: string; done: boolean }>(list: readonly T[]) =>
      Object.keys(phase).length
        ? list.map((t) => (t.done && phase[t.id] ? { ...t, done: false } : t))
        : list,
    [phase]
  );

  return useMemo(
    () => ({ phase, check, hold, drop }),
    [phase, check, hold, drop]
  );
}

export type Completion = ReturnType<typeof useCompletion>;

const Scope = createContext<Completion | null>(null);

/** Rows below read their phase and their check from here. */
export function CompletionScope({
  value,
  children,
}: {
  value: Completion;
  children: ReactNode;
}) {
  return <Scope.Provider value={value}>{children}</Scope.Provider>;
}

/** The screen's completion, or null (a `<Task>` on its own just toggles). */
export const useCompletionScope = () => useContext(Scope);
