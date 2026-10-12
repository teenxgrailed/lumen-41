"use client";

import { type MouseEvent, useState } from "react";

import type { V3Project, V3Task } from "@/lib/needt3/map";

import { Task } from "../task/Task";
import {
  cardLine,
  cardTasks,
  openLine,
  projectHue,
  projectStats,
} from "./model";
import { Ring } from "./parts";

const frame = (hue: string) =>
  `color-mix(in oklab, ${hue} 24%, var(--background))`;

/**
 * A project's overview card ($P/work.jsx ProjectCard): name, count, ring
 * and its next four tasks. A click anywhere but on a task row opens the
 * project's page.
 */
export function ProjectCard({
  project: p,
  tasks,
  today,
  index,
  onOpenTask,
  onPick,
}: {
  project: V3Project;
  tasks: readonly V3Task[];
  today: string;
  index: number;
  onOpenTask: (id: string) => void;
  onPick: (id: string) => void;
}) {
  const [hot, setHot] = useState(false);
  const s = projectStats(p.id, tasks, today);
  const hue = projectHue(p);
  const pickHere = (e: MouseEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    if (el.closest?.("[data-task], button, input")) return;
    onPick(p.id);
  };
  return (
    <div
      className={`nx-swap wk-pcard is-link${hot ? " is-hot" : ""}`}
      data-ctx="project"
      data-ctx-id={p.id}
      data-wk-pcard={p.id}
      role="button"
      tabIndex={0}
      aria-label={`Open ${p.name}`}
      onClick={pickHere}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.key === "Enter" || e.key === " ")
        ) {
          e.preventDefault();
          onPick(p.id);
        }
      }}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      style={{ animationDelay: `${index * 40}ms`, background: frame(hue) }}
    >
      <div className="wk-pcard-plate">
        <div className="wk-pcard-head">
          <span className="wk-col">
            <span title={p.name} className="wk-pcard-name">
              {p.name}
            </span>
            <span className="wk-meta">{cardLine(s)}</span>
          </span>
          <Ring pct={s.pct} hue={hue} />
        </div>
        {cardTasks(p.id, tasks).map((t) => (
          <Task
            key={t.id}
            layout="row"
            density="mini"
            compact
            task={t}
            today={today}
            onOpen={onOpenTask}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Compact project card on Tasks ($P/work.jsx WkMiniCard): same hue frame,
 * ring and open count, ~180 wide; a click filters the list.
 */
export function MiniCard({
  id,
  name,
  hue,
  open,
  total,
  selected,
  onPick,
  index,
  none,
}: {
  id: string;
  name: string;
  hue: string;
  open: number;
  total: number;
  selected: boolean;
  onPick: () => void;
  index: number;
  none?: boolean;
}) {
  const [hot, setHot] = useState(false);
  const pct = total ? (total - open) / total : 0;
  const ring = selected ? "var(--text-primary) 0 0 0 1.5px inset" : null;
  const lift = hot ? "var(--shadow-raised-hover)" : "var(--shadow-ring)";
  return (
    <button
      type="button"
      className="nx-swap nx-press wk-mcard"
      data-wk-card={id}
      aria-pressed={selected}
      data-ctx={none ? undefined : "project"}
      data-ctx-id={none ? undefined : id}
      title={selected ? `Clear filter · ${name}` : `Show only ${name}`}
      onClick={onPick}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      style={{
        animationDelay: `${index * 40}ms`,
        background: frame(hue),
        boxShadow: ring ? `${ring}, ${lift}` : lift,
        transform: hot ? "translateY(-1px)" : "none",
      }}
    >
      <span className="wk-mcard-plate">
        <span className="wk-col">
          <span className={`wk-mcard-name${none ? " is-none" : ""}`}>
            {name}
          </span>
          <span className="wk-meta wk-num">{openLine({ open, total })}</span>
        </span>
        <Ring pct={pct} hue={hue} />
      </span>
    </button>
  );
}
