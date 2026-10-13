"use client";

import { type ReactNode } from "react";

import { FiArrowRight } from "react-icons/fi";

import { useTickStep } from "@/lib/needt3/hooks/tasks";
import type { V3Task, V3TaskPart } from "@/lib/needt3/map";

import { TaskCheck } from "../task/TaskCheck";
import { closingLine, flowSteps, waitsOn } from "./flow";

/**
 * Tick a step of a task from the project page. The last open step closes the
 * task with it (one write, one undo); `onClosed` tells the person, in the
 * face's own voice (a toast on desktop, a snack on the phone).
 */
export function useFlowTick(
  onClosed: (task: V3Task, undo: () => Promise<void>) => void
) {
  const { tick } = useTickStep();
  return (task: V3Task, part: V3TaskPart) => {
    void tick(task, part)
      .then(({ closed, undo }) => {
        if (closed) onClosed(task, undo);
      })
      .catch(() => undefined);
  };
}

/**
 * A task in the flow of its project: the steps first (the first step, then
 * the subtasks in the order they are done), then the task itself as the
 * closing step — `children` is the task's own row — and a quiet line under it
 * for what it waits on. A task with neither is just its row.
 *
 * The same markup serves both faces; `touch` only sizes the tap targets.
 */
export function FlowItem({
  task,
  all,
  touch,
  onTick,
  children,
}: {
  task: V3Task;
  /** The project's tasks, to find what this one waits on. */
  all: readonly V3Task[];
  touch?: boolean;
  onTick: (task: V3Task, part: V3TaskPart) => void;
  children: ReactNode;
}) {
  const steps = task.done ? null : flowSteps(task);
  const wait = task.done ? null : waitsOn(task, all);
  if (!steps && !wait) return <>{children}</>;
  return (
    <div
      className={`wk-flow${steps ? " has-steps" : ""}${wait ? " is-blocked" : ""}${touch ? " is-touch" : ""}`}
      data-wk-flow={task.id}
    >
      {steps ? (
        <ol className="wk-steps" aria-label={`Steps before “${task.title}”`}>
          {steps.entry ? (
            <li className="wk-step is-entry">
              <span className="wk-step-mark" aria-hidden="true">
                <FiArrowRight size={12} />
              </span>
              <span className="wk-step-text" title={steps.entry}>
                {steps.entry}
              </span>
              <span className="wk-step-tag">First step</span>
            </li>
          ) : null}
          {steps.parts.map((p) => (
            <li key={p.id} className={`wk-step${p.done ? " is-done" : ""}`}>
              <span className="wk-step-mark">
                <TaskCheck
                  on={p.done}
                  touch={touch}
                  size={touch ? 20 : undefined}
                  onClick={() => onTick(task, p)}
                />
              </span>
              <span className="wk-step-text" title={p.title}>
                {p.title}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {children}
      {steps ? (
        <div className="wk-close" data-wk-close>
          {closingLine(steps)}
        </div>
      ) : null}
      {wait ? (
        <div className="wk-wait" data-wk-wait title={`Waits on ${wait.title}`}>
          Waits on “{wait.title}”
        </div>
      ) : null}
    </div>
  );
}
