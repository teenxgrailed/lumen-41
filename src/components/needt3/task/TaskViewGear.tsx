"use client";

import { useState } from "react";

import * as Popover from "@radix-ui/react-popover";
import { FiSettings } from "react-icons/fi";

import { useSetTaskView, useTaskView } from "@/lib/needt3/hooks/task-view";
import type {
  CompletedMode,
  SubtaskMode,
  TaskViewSettings,
} from "@/lib/needt3/task-view";

import { Seg2 } from "../calendar/Seg2";
import { useV3PortalContainer } from "../ctx/PortalScope";
import { useExit } from "../ctx/useExit";
import { V3Switch } from "../settings/kit";

/** Which lists the gear sits on decides which options can change them. */
export type TaskViewScope = "home" | "tasks" | "calendar";

const COMPLETED_HINT: Record<CompletedMode, string> = {
  hide: "A ticked task leaves the lists at once.",
  today: "A ticked task stays until the end of the day.",
  always: "A ticked task stays in the lists.",
};

const SUBTASK_HINT: Record<SubtaskMode, string> = {
  next: "Next step + expand: the next step under the title, a tap on 0/3 unfolds the rest.",
  all: "All steps open: every step is listed under the title.",
  count: "Count only: just 0/3.",
};

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="nt-row" data-tv-row={label}>
      <span className="nt-row-label">{label}</span>
      <div className="nt-row-control">{children}</div>
      {hint ? <span className="nt-row-hint">{hint}</span> : null}
    </div>
  );
}

/** One switch row of the form; a screen can add its own (the Calendar's Hide done). */
export function TaskViewToggle({
  label,
  on,
  onChange,
  hint,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <Row label={label} hint={hint}>
      <V3Switch checked={on} onChange={onChange} label={label} />
    </Row>
  );
}

/** The form itself: pure of the popover, so a screen could host it anywhere. */
export function TaskViewForm({
  view,
  onChange,
  scope,
  extra,
}: {
  view: TaskViewSettings;
  onChange: (patch: Partial<TaskViewSettings>) => void;
  scope: TaskViewScope;
  /** Rows of the screen's own, after the shared ones. */
  extra?: React.ReactNode;
}) {
  const lists = scope !== "calendar";
  return (
    <div className="nt-form tv-form" data-task-view-form="">
      <Row label="Completed" hint={COMPLETED_HINT[view.completed]}>
        <Seg2
          value={view.completed}
          onChange={(v) => onChange({ completed: v as CompletedMode })}
          options={[
            ["hide", "Hide"],
            ["today", "Today"],
            ["always", "Keep"],
          ]}
        />
      </Row>
      <Row label="Subtasks" hint={SUBTASK_HINT[view.subtasks]}>
        <Seg2
          value={view.subtasks}
          onChange={(v) => onChange({ subtasks: v as SubtaskMode })}
          options={[
            ["next", "Next step"],
            ["all", "All steps"],
            ["count", "Count"],
          ]}
        />
      </Row>
      <TaskViewToggle
        label="Duration"
        on={view.duration}
        onChange={(duration) => onChange({ duration })}
      />
      <TaskViewToggle
        label="Project"
        on={view.project}
        onChange={(project) => onChange({ project })}
      />
      {lists ? (
        <Row label="Sort by">
          <Seg2
            value={view.sort}
            onChange={(v) => onChange({ sort: v as TaskViewSettings["sort"] })}
            options={[
              ["time", "Time"],
              ["priority", "Priority"],
              ["due", "Due"],
            ]}
          />
        </Row>
      ) : null}
      {scope === "tasks" ? (
        <Row label="Group by">
          <Seg2
            value={view.group}
            onChange={(v) =>
              onChange({ group: v as TaskViewSettings["group"] })
            }
            options={[
              ["date", "Date"],
              ["project", "Project"],
              ["priority", "Priority"],
            ]}
          />
        </Row>
      ) : null}
      {lists ? (
        <TaskViewToggle
          label="Overdue first"
          on={view.overdueFirst}
          onChange={(overdueFirst) => onChange({ overdueFirst })}
        />
      ) : null}
      {extra}
    </div>
  );
}

/**
 * The gear at the top right of Home, Tasks and the Calendar: one popover, one
 * setting (`prefs.taskView`) for every task list. A change applies to the
 * lists at once and is saved with the rest of the person's settings.
 */
export function TaskViewGear({
  scope,
  extra,
}: {
  scope: TaskViewScope;
  /** Rows of the screen's own (the Calendar's Hide done), saved by the screen. */
  extra?: React.ReactNode;
}) {
  const view = useTaskView();
  const set = useSetTaskView();
  const container = useV3PortalContainer();
  const [open, setOpen] = useState(false);
  const [shown, leaving] = useExit(open, 130);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="nx-btn nx-btn-text tv-gear"
          aria-label="Task view"
          title="Task view"
          data-task-view-gear=""
          aria-expanded={open}
        >
          <FiSettings size={15} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      {shown && container ? (
        <Popover.Portal container={container} forceMount>
          <Popover.Content
            forceMount
            align="end"
            sideOffset={6}
            collisionPadding={8}
            className={`nx-pop is-right tv-pop${leaving ? " is-leaving" : ""}`}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <TaskViewForm
              view={view}
              onChange={(p) => void set(p)}
              scope={scope}
              extra={extra}
            />
          </Popover.Content>
        </Popover.Portal>
      ) : null}
    </Popover.Root>
  );
}
