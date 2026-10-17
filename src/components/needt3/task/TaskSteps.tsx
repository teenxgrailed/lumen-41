"use client";

import { useCallback, useMemo } from "react";

import { FiCheck, FiChevronDown } from "react-icons/fi";

import { useStepsOpen } from "@/lib/needt3/hooks/steps-open";
import { useTaskView } from "@/lib/needt3/hooks/task-view";
import { useTickStep } from "@/lib/needt3/hooks/tasks";
import type { V3Task } from "@/lib/needt3/map";
import {
  type StepItem,
  nextStep,
  stepLabel,
  stepList,
} from "@/lib/needt3/step-list";
import type { SubtaskMode } from "@/lib/needt3/task-view";

import { PartRing } from "./PartRing";
import { TaskCheck } from "./TaskCheck";

/**
 * A task's steps inside its row. What shows is the task view's `subtasks`
 * option: the next step under the title with a tap to unfold the rest
 * ("next"), every step open ("all"), or only the 0/3 count ("count").
 * Ticking a step is the subtask write the project page and
 * `needt_complete_subtask` use (`useTickStep`); the last step closes the task.
 */
export interface StepsState {
  mode: SubtaskMode;
  task: Pick<V3Task, "id" | "title" | "done" | "parts">;
  items: StepItem[];
  next: StepItem | null;
  count: { done: number; total: number };
  /** The list is unfolded: always in "all", by the person in "next". */
  expanded: boolean;
  /** There is something to fold: "next" mode with steps. */
  canFold: boolean;
  toggle: () => void;
  tick: (item: StepItem) => void;
}

type Stepped = Pick<V3Task, "id" | "title" | "done"> &
  Partial<Pick<V3Task, "entry" | "parts">>;

/** The steps of `task`, or null when it has none (or is not a task). */
export function useTaskSteps(task: Stepped | null): StepsState | null {
  const { subtasks: mode } = useTaskView();
  const [open, setOpen] = useStepsOpen(task?.id ?? "");
  const { tick: tickStep } = useTickStep();
  const items = useMemo(() => (task ? stepList(task) : []), [task]);
  const parts = task?.parts;
  const tick = useCallback(
    (item: StepItem) => {
      if (!task || !item.part) return;
      void tickStep(
        { id: task.id, done: task.done, parts: parts ?? [] },
        item.part
      ).catch(() => undefined);
    },
    [task, parts, tickStep]
  );
  if (!task || !items.length) return null;
  const real = items.filter((s) => s.part);
  return {
    mode,
    task: {
      id: task.id,
      title: task.title,
      done: task.done,
      parts: parts ?? [],
    },
    items,
    next: nextStep(items, task.done),
    count: { done: real.filter((s) => s.done).length, total: real.length },
    expanded: mode === "all" || (mode === "next" && open),
    canFold: mode === "next",
    toggle: () => setOpen(!open),
    tick,
  };
}

/** The 0/3 badge; in "next" mode it is also the tap that folds the list. */
export function StepsCount({ steps }: { steps: StepsState }) {
  const { done, total } = steps.count;
  const inner = (
    <>
      <PartRing done={done} total={total} />
      {done}/{total}
      {steps.canFold ? (
        <FiChevronDown size={12} aria-hidden="true" className="tk-count-chev" />
      ) : null}
    </>
  );
  if (!steps.canFold)
    return (
      <span
        className="tk-count"
        title={`${done} of ${total} parts done`}
        data-steps-count=""
      >
        {inner}
      </span>
    );
  return (
    <button
      type="button"
      className={`tk-count tk-count-btn${steps.expanded ? " is-open" : ""}`}
      aria-expanded={steps.expanded}
      aria-label={`${done} of ${total} steps done, ${steps.expanded ? "hide" : "show"} steps`}
      data-steps-toggle=""
      onClick={(event) => {
        event.stopPropagation();
        steps.toggle();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {inner}
    </button>
  );
}

/**
 * Under the title: the next undone step, and the list that unfolds. The list
 * folds through grid rows (transform-free height, same as a row's fold); the
 * folded list is inert so it cannot take focus.
 */
export function StepsBlock({
  steps,
  touch,
  badge,
}: {
  steps: StepsState;
  touch?: boolean;
  /** Carry the count (and the fold tap) on the next-step line: rows with no badge of their own. */
  badge?: boolean;
}) {
  if (steps.mode === "count" && !badge) return null;
  const { next, expanded } = steps;
  const line =
    next && !expanded && steps.mode !== "count" ? (
      <div className="tk-step-next" data-step-next="">
        {stepLabel(next)}
      </div>
    ) : null;
  return (
    <div
      className={`tk-steps${touch ? " is-touch" : ""}${badge ? " has-badge" : ""}`}
      data-steps={steps.task.id}
    >
      {badge ? (
        <div className="tk-steps-head">
          {line ?? <span className="tk-step-next" />}
          <StepsCount steps={steps} />
        </div>
      ) : (
        line
      )}
      {steps.mode === "count" ? null : (
        <div className={`tk-steps-fold${expanded ? " is-open" : ""}`}>
          <ol
            className="tk-steps-list"
            aria-label={`Steps of “${steps.task.title}”`}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {...(expanded ? {} : ({ inert: true } as any))}
            data-steps-list=""
          >
            {steps.items.map((s) => (
              <li
                key={s.key}
                className={`tk-step${s.done ? " is-done" : ""}`}
                data-step={s.n}
              >
                <span className="tk-step-mark">
                  {s.part ? (
                    <TaskCheck
                      on={s.done}
                      touch={touch}
                      size={touch ? 18 : undefined}
                      onClick={() => steps.tick(s)}
                    />
                  ) : (
                    <span
                      className={`tk-step-fixed${s.done ? " is-on" : ""}`}
                      aria-hidden="true"
                    >
                      {s.done ? <FiCheck size={10} /> : null}
                    </span>
                  )}
                </span>
                <span className="tk-step-text" title={s.title}>
                  {stepLabel(s)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/**
 * The steps of a phone row, under it. A component of its own so a row with no
 * subtasks mounts none of the task view / mutation hooks.
 */
function PhoneSteps({
  task,
  hideSteps,
}: {
  task: V3Task;
  hideSteps?: boolean;
}) {
  const found = useTaskSteps(task);
  if (!found) return null;
  const steps = hideSteps
    ? { ...found, mode: "count" as const, canFold: false }
    : found;
  return <StepsBlock steps={steps} touch badge />;
}

export function PhoneStepsSlot({
  task,
  hideSteps,
}: {
  task: V3Task;
  hideSteps?: boolean;
}) {
  return task.parts?.length ? (
    <PhoneSteps task={task} hideSteps={hideSteps} />
  ) : null;
}
