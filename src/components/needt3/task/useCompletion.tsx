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

import { skipToken, useQuery } from "@tanstack/react-query";

import { useNeedtReducedMotion } from "@/components/providers/MotionRuntime";

import { haptic } from "@/lib/native";
import { useTaskView } from "@/lib/needt3/hooks/task-view";
import { useToggleTask } from "@/lib/needt3/hooks/tasks";
import type { V3Task } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { FOLD_MS, STRIKE_HOLD_MS, remoteChanges } from "./completion-logic";

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

/** Struck for STRIKE_HOLD_MS, folded for FOLD_MS: 900 ms in all. */
export { FOLD_MS, STRIKE_HOLD_MS };

type Closable = Pick<V3Task, "id" | "done" | "title">;

const none = () => undefined;

function without<T>(m: Record<string, T>, id: string) {
  if (!(id in m)) return m;
  const next = { ...m };
  delete next[id];
  return next;
}

export interface CompletionOptions {
  /**
   * Rows the screen draws in a list that only holds OPEN tasks (Home's
   * Overdue and Inbox) leave after the strike whatever Completed tasks is set
   * to: there is nowhere for them to stay struck.
   */
  leaves?: (t: Closable) => boolean;
}

export function useCompletion(options: CompletionOptions = {}) {
  const { completed } = useTaskView();
  const toggle = useToggleTask();
  const reduced = useNeedtReducedMotion();
  const [phase, setPhase] = useState<Record<string, CompletionPhase>>({});
  const timers = useRef<Record<string, number[]>>({});
  // rows that will leave the page once the strike is over (the others stay
  // struck where they are)
  const [departing, setDeparting] = useState<Record<string, true>>({});
  const live = useRef({
    completed,
    toggle,
    reduced,
    phase,
    leaves: options.leaves,
  });
  live.current = {
    completed,
    toggle,
    reduced,
    phase,
    leaves: options.leaves,
  };

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
      setDeparting((m) => without(m, id));
    },
    [clear]
  );

  // A task another writer closed (a second device, the MCP, the API) does not
  // blink out: it folds like any other, without the pop. Compared while
  // rendering, so the row never has a frame with the data changed and the
  // phase not yet set. The cache is only read here (nothing is fetched).
  const tasks = useQuery({
    queryKey: qk.tasks({}),
    queryFn: skipToken,
  }).data as readonly Pick<V3Task, "id" | "done" | "title">[] | undefined;
  const [seen, setSeen] = useState(tasks);
  if (tasks !== seen) {
    setSeen(tasks);
    const { closed, reopened } = remoteChanges(seen, tasks, phase);
    if (!reduced) {
      const fold = closed.filter(
        (id) =>
          completed === "hide" ||
          options.leaves?.(
            tasks?.find((t) => t.id === id) as Pick<
              V3Task,
              "id" | "done" | "title"
            >
          )
      );
      if (fold.length) {
        setPhase((m) => ({
          ...m,
          ...Object.fromEntries(fold.map((id) => [id, "collapse" as const])),
        }));
        setDeparting((m) => ({
          ...m,
          ...Object.fromEntries(fold.map((id) => [id, true as const])),
        }));
      }
    }
    if (reopened.length) {
      setPhase((m) => reopened.reduce(without, m));
      setDeparting((m) => reopened.reduce(without, m));
    }
  }
  useEffect(() => {
    for (const [id, p] of Object.entries(phase))
      if (p === "collapse" && !timers.current[id])
        timers.current[id] = [window.setTimeout(() => drop(id), FOLD_MS)];
  }, [phase, drop]);

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
        if (mode === "hide" || live.current.leaves?.(t)) {
          setDeparting((m) => ({ ...m, [t.id]: true }));
          timers.current[t.id] = [
            window.setTimeout(
              () =>
                setPhase((m) => (m[t.id] ? { ...m, [t.id]: "collapse" } : m)),
              STRIKE_HOLD_MS
            ),
            window.setTimeout(() => drop(t.id), STRIKE_HOLD_MS + FOLD_MS),
          ];
        }
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
    () => ({ phase, departing, check, hold, drop }),
    [phase, departing, check, hold, drop]
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
