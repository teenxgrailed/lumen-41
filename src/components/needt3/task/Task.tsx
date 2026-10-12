"use client";

import {
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  useState,
} from "react";

import { FiArrowRight } from "react-icons/fi";

import { useDesignV3 } from "@/components/needt3/root/V3Root";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { NEUTRAL_MARK, type ProjectLike } from "@/lib/needt3/derive";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { useToggleTask } from "@/lib/needt3/hooks/tasks";

import { TaskCheck } from "./TaskCheck";
import { DeskMeta, LineMeta, PartCount, TaskValue } from "./chips";
import { type TaskEntry, isTaskEvent, taskView } from "./view";

export type { TaskEntry, TaskEvent, TaskView } from "./view";
export { isTaskEvent, taskView } from "./view";

/**
 * THE TASK ($P/task.jsx): one component, three layouts.
 *   row   — density "desk" (default), "touch", "agenda", "mini".
 *   card  — density "desk" (default), "touch", "preview"; actions = children.
 *   block — a calendar block; the caller places it (`style`) and passes the
 *           box it got (`box`) so the text can follow the <30 min rule.
 * Without `onToggle` the check closes / reopens the task through
 * `useToggleTask` (status `completed`); open parts do not block it.
 */
export interface TaskProps {
  task: TaskEntry;
  layout?: "row" | "card" | "block";
  onToggle?: (id: string) => void;
  onOpen?: (id: string, task: TaskEntry) => void;
  draggable?: boolean;
  dense?: boolean;
  density?: "desk" | "touch" | "agenda" | "mini" | "preview";
  dragProps?: (
    task: TaskEntry,
    mode: "place"
  ) => HTMLAttributes<HTMLDivElement>;
  /** Projects to resolve `projectId` against; defaults to `useProjects()`. */
  projects?: readonly ProjectLike[];
  /** The person's day ("YYYY-MM-DD") for overdue; defaults to today in their zone. */
  today?: string;
  late?: boolean;
  phase?: "strike" | "collapse" | "out";
  back?: boolean;
  hideProject?: boolean;
  compact?: boolean;
  stacked?: boolean;
  label?: string;
  note?: string;
  children?: ReactNode;
  box?: {
    h?: number;
    w?: number;
    padTop?: number;
    tight?: boolean;
    cascade?: boolean;
  };
  lit?: boolean;
  selected?: boolean;
  events?: HTMLAttributes<HTMLDivElement>;
  className?: string;
  style?: CSSProperties;
}

/** Renders only inside the v3 frame; flag off it mounts nothing. */
export function Task(props: TaskProps) {
  const v3 = useDesignV3();
  return v3 ? <TaskContent {...props} /> : null;
}

function TaskContent(props: TaskProps) {
  const {
    task,
    layout = "row",
    onToggle,
    onOpen,
    dragProps,
    hideProject,
    compact,
    stacked,
    phase,
    back,
    label,
    note,
    children,
    box = {},
    lit,
    selected,
    events,
    style,
    className = "",
  } = props;
  const projectsQuery = useProjects();
  const tz = useTimeZone();
  const toggleTask = useToggleTask();
  const [hot, setHot] = useState(false);
  const [focused, setFocused] = useState(false);
  const today = props.today ?? formatInTimeZone(newDate(), tz, "yyyy-MM-dd");
  const v = taskView(task, props.projects ?? projectsQuery.data, today);
  const density = props.density ?? (props.dense ? "mini" : "desk");
  const late = props.late ?? (layout === "card" && v.overdue);
  const canOpen = !!onOpen && !v.event;
  const open = () => {
    if (canOpen) onOpen?.(task.id, task);
  };
  const openProps: HTMLAttributes<HTMLDivElement> = canOpen
    ? {
        role: "button",
        tabIndex: 0,
        onClick: open,
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
        onKeyDown: (event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            open();
          }
        },
      }
    : {};
  const toggle = onToggle
    ? () => onToggle(task.id)
    : isTaskEvent(task)
      ? undefined
      : () => void toggleTask.toggle(task).catch(() => undefined);
  const check = (
    <TaskCheck key={task.id} on={v.done || !!phase} onClick={toggle} />
  );
  const hue = v.event ? "var(--text-tertiary)" : v.hue || NEUTRAL_MARK.color;
  const identity = {
    "data-task": v.event ? undefined : v.id,
    "data-ctx": v.event ? undefined : "task",
    "data-ctx-id": v.event ? undefined : v.id,
  };

  if (layout === "block") {
    const h = box.h ?? Math.max((v.len / 60) * 52 - 3, 20);
    const pt = box.padTop || 0;
    const short = v.len < 30 || h - pt < 34;
    const lines = Math.max(1, Math.floor((h - pt - (box.tight ? 5 : 23)) / 15));
    // time prefix only when "09:00 " plus ~6 characters of title fit
    const fitTime =
      (box.w ?? 999) - 15 >= 38 + Math.min(v.title.length, 6) * 6.4;
    const shadow =
      [
        lit ? "var(--shadow-raised)" : null,
        box.cascade ? "var(--surface-raised) 0 0 0 1px" : null,
        selected ? "var(--accent) 0 0 0 1.5px inset" : null,
        focused ? "var(--accent) 0 0 0 2px" : null,
      ]
        .filter(Boolean)
        .join(", ") || "none";
    return (
      <div
        {...identity}
        {...openProps}
        {...events}
        className={`tk-block ${className}`}
        style={{
          padding: `${(short ? 2 : 5) + pt}px 6px 2px 9px`,
          background: v.event
            ? lit
              ? "var(--fill-5)"
              : "var(--fill-4)"
            : `color-mix(in oklch, ${hue} ${lit ? 22 : 14}%, var(--surface-raised))`,
          boxShadow: shadow,
          opacity: v.done ? 0.5 : 1,
          transform: lit ? "translateY(-1px)" : "none",
          ...style,
        }}
      >
        <span
          aria-hidden="true"
          className="tk-block-rail"
          style={{ background: hue }}
        />
        {short ? (
          <div className="tk-block-line">
            {fitTime ? <span className="tk-block-time">{v.time}</span> : null}
            <span className={`tk-block-ltitle${v.done ? " is-done" : ""}`}>
              {v.title}
            </span>
          </div>
        ) : (
          <>
            <div
              className={`tk-block-title${v.done ? " is-done" : ""}`}
              style={{ WebkitLineClamp: lines }}
            >
              {v.title}
            </div>
            {!box.tight ? (
              <div className="tk-block-range">{v.range}</div>
            ) : null}
          </>
        )}
      </div>
    );
  }

  if (layout === "card") {
    if (density === "preview")
      return (
        <div
          {...identity}
          {...openProps}
          className={`tk-prev ${className}`}
          style={style}
        >
          {check}
          <span className={`tk-prev-title${v.done ? " is-done" : ""}`}>
            {v.title}
          </span>
          <span className="tk-prev-where">
            {v.projectName || "Inbox"} ·{" "}
            {!isTaskEvent(task) && task.dueDate === today
              ? "today"
              : v.due || "later"}
          </span>
        </div>
      );
    if (density === "touch")
      return (
        <div {...identity} className={`tk-tcard ${className}`} style={style}>
          <span
            aria-hidden="true"
            className="tk-tcard-rail"
            style={{
              background: v.projectName
                ? v.hue || "var(--text-muted)"
                : "var(--text-muted)",
            }}
          />
          <span className="tk-tcard-head">
            {label ? <span className="tk-label">{label}</span> : null}
            <span className="tk-tcard-meta">
              <LineMeta view={v} late={late} />
            </span>
          </span>
          <div {...openProps} className="tk-tcard-title">
            {v.title}
          </div>
          {note ? <span className="tk-tcard-note">{note}</span> : null}
          {children ? <span className="tk-tcard-acts">{children}</span> : null}
        </div>
      );
    const cardHue = v.hue || "var(--text-muted)";
    return (
      <div
        {...identity}
        className={`hd-card nx-swap tk-card ${className}`}
        style={{
          background: `color-mix(in oklab, ${cardHue} 22%, var(--background))`,
          ...style,
        }}
      >
        <div aria-label={label} className="tk-card-plate">
          <div className="tk-card-label">
            <span>{label}</span>
            <span className="tk-card-right">
              {late && v.due ? (
                <span className="tk-late" title={v.lateTitle}>
                  {v.due}
                </span>
              ) : v.time ? (
                <span>{v.time}</span>
              ) : null}
              {v.minutes ? <span>{v.dur}</span> : null}
              {v.projectName ? (
                <span className="tk-card-proj">
                  <span
                    aria-hidden="true"
                    className="tk-dot"
                    style={{ background: cardHue }}
                  />
                  <span className="tk-clip">{v.projectName}</span>
                </span>
              ) : null}
            </span>
          </div>
          <div key={v.id} className="nx-swap tk-card-text">
            <div {...openProps} title={v.title} className="tk-card-title">
              {v.title}
            </div>
            {note ? (
              <div title={note} className="tk-card-note">
                {note}
              </div>
            ) : null}
          </div>
          {children ? <div className="tk-card-acts">{children}</div> : null}
        </div>
      </div>
    );
  }

  if (density === "touch")
    return (
      <div
        {...identity}
        {...openProps}
        className={`mb-row tk-touch ${className}`}
        style={{ opacity: phase === "out" ? 0 : 1, ...style }}
      >
        <span className="tk-touch-check">
          <TaskCheck
            key={task.id}
            touch
            on={v.done || !!phase}
            onClick={toggle}
          />
        </span>
        <span className="tk-touch-body">
          <span className="tk-touch-line">
            <span
              className={`tk-touch-title${v.done || phase ? " is-done" : ""}`}
            >
              {v.title}
            </span>
            <PartCount view={v} />
            <TaskValue view={v} />
          </span>
          <LineMeta view={v} late={late} hideProject={hideProject} />
        </span>
      </div>
    );
  if (density === "mini")
    return (
      <div
        {...identity}
        {...openProps}
        className={`tk-mini ${className}`}
        style={style}
      >
        {check}
        <span
          title={v.title}
          className={`tk-mini-title${v.done ? " is-done" : ""}`}
        >
          {v.title}
        </span>
        {!compact && v.minutes ? (
          <span className="tk-mini-dur">{v.dur}</span>
        ) : null}
      </div>
    );
  if (density === "agenda")
    return (
      <div
        {...identity}
        {...openProps}
        className={`tk-agenda${hot ? " is-hot" : ""}${v.done ? " is-done" : ""} ${className}`}
        onMouseEnter={() => setHot(true)}
        onMouseLeave={() => setHot(false)}
        style={style}
      >
        {compact ? null : (
          <span className={`tk-ag-time${v.at == null ? " is-allday" : ""}`}>
            {v.time ?? "All day"}
          </span>
        )}
        <span
          aria-hidden="true"
          className="tk-rail"
          style={{ background: hue }}
        />
        <div className={`tk-ag-body${stacked ? " is-stacked" : ""}`}>
          {compact ? (
            <span className="tk-ag-ctime">
              {v.time ?? "All day"}
              {v.minutes ? (
                <span className="tk-ag-cdur"> · {v.durLong}</span>
              ) : null}
            </span>
          ) : null}
          <span className={`tk-ag-title${v.done ? " is-done" : ""}`}>
            {v.title}
          </span>
          {compact ? null : (
            <span className="tk-ag-meta">
              {v.minutes ? v.durLong : null}
              <span
                className="tk-ag-chip"
                style={{
                  background: `color-mix(in oklch, ${hue} 12%, var(--fill-2))`,
                }}
              >
                <span
                  aria-hidden="true"
                  className="tk-dot"
                  style={{ background: hue }}
                />
                <span className="tk-clip">
                  {v.event ? v.calendarName : v.projectName || "Inbox"}
                </span>
              </span>
            </span>
          )}
        </div>
      </div>
    );
  return (
    <div
      className={`hd-row${phase === "collapse" ? " is-collapsing" : ""}${phase ? " is-striking" : ""}${back ? " nx-swap" : ""} ${className}`}
      style={style}
    >
      <div>
        <div
          {...(props.draggable && dragProps ? dragProps(task, "place") : {})}
        >
          <div
            {...identity}
            {...openProps}
            className={`tk-desk${hot ? " is-hot" : ""}`}
            onMouseEnter={() => setHot(true)}
            onMouseLeave={() => setHot(false)}
          >
            {check}
            <span className="tk-desk-body">
              <span
                title={v.title}
                className={`hd-title tk-desk-title${phase ? " is-struck" : ""}${v.done ? " is-done" : ""}${v.done && !phase ? " is-crossed" : ""}`}
              >
                {v.title}
              </span>
              <PartCount view={v} />
              <TaskValue view={v} />
            </span>
            <DeskMeta
              view={v}
              late={late}
              hot={hot}
              hideProject={hideProject}
            />
          </div>
          {v.entry && (!v.done || phase) ? (
            <div className="tk-entry">
              <FiArrowRight size={12} aria-hidden="true" />
              {v.entry}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
