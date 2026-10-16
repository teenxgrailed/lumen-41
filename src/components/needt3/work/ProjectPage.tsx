"use client";

import { useRef, useState } from "react";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  LuArchive,
  LuEllipsis,
  LuFolder,
  LuPencil,
  LuPlus,
} from "react-icons/lu";

import { useCreateTask } from "@/lib/needt3/hooks/tasks";
import { useTaskView } from "@/lib/needt3/hooks/task-view";
import type { V3Project, V3Task } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { useExit } from "../ctx/useExit";
import { Task } from "../task/Task";
import { FlowItem, useFlowTick } from "./FlowItem";
import { blockedIds, flowSteps } from "./flow";
import {
  isOverdue,
  openLine,
  projectGroups,
  projectHue,
  projectStats,
  wkMins,
} from "./model";
import { Capped, Fold, Ring, WkEmpty } from "./parts";

/** The page's ⋯ menu ($P/work.jsx WkMore) on Radix, in the v3 scope. */
function MoreMenu({
  label,
  onEdit,
  onDelete,
  deleteTitle,
}: {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
  deleteTitle?: string;
}) {
  const container = useV3PortalContainer();
  const [open, setOpen] = useState(false);
  const [shown, leaving] = useExit(open, 130);
  return (
    <Dropdown.Root open={open} onOpenChange={setOpen} modal={false}>
      <Dropdown.Trigger asChild>
        <button type="button" aria-label={label} className="btn-icon btn-ghost">
          <LuEllipsis size={18} aria-hidden />
        </button>
      </Dropdown.Trigger>
      {shown && container ? (
        <Dropdown.Portal container={container} forceMount>
          <Dropdown.Content
            forceMount
            align="end"
            sideOffset={6}
            className={`nx-pop is-right${leaving ? " is-leaving" : ""}`}
          >
            <div className="nt-menu" style={{ width: 200 }}>
              <Dropdown.Item className="nt-menu-item" onSelect={onEdit}>
                <LuPencil size={14} aria-hidden />
                Edit project
              </Dropdown.Item>
              <Dropdown.Separator className="nt-menu-sep" />
              <Dropdown.Item
                className="nt-menu-item"
                data-variant="destructive"
                title={deleteTitle}
                onSelect={onDelete}
              >
                <LuArchive size={14} aria-hidden />
                Archive project
              </Dropdown.Item>
            </div>
          </Dropdown.Content>
        </Dropdown.Portal>
      ) : null}
    </Dropdown.Root>
  );
}

/**
 * One project on its own ($P/work.jsx WkProjectPage): the colour tile, name
 * and numbers, an "Add a task" line, open tasks grouped by when, and a Done
 * fold (closed by default).
 */
export function ProjectPage({
  project: p,
  tasks,
  today,
  onOpenTask,
  onEdit,
  onDelete,
  fold,
  onFold,
  draft,
  onDraft,
}: {
  project: V3Project;
  tasks: readonly V3Task[];
  today: string;
  onOpenTask: (id: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Folded groups and the "Add a task" text, held above the face switch. */
  fold: Record<string, boolean>;
  onFold: (key: string) => () => void;
  draft: string;
  onDraft: (v: string) => void;
}) {
  const hue = projectHue(p);
  const s = projectStats(p.id, tasks, today);
  const view = useTaskView();
  const { groups, done } = projectGroups(p.id, tasks, today, view);
  const flip = onFold;
  const setDraft = onDraft;
  const addRef = useRef<HTMLInputElement>(null);
  const create = useCreateTask();

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    void create
      .mutateAsync({
        draft: { title, projectId: p.id, estimatedMinutes: 30, done: false },
      })
      .then(({ undo }) =>
        notify.success(`Added to “${p.name}”`, {
          action: { label: "Undo", onClick: () => void undo() },
        })
      )
      .catch(() => undefined);
  };

  const tick = useFlowTick((t, undo) =>
    notify.success(`Closed “${t.title}” — every step was done`, {
      action: { label: "Undo", onClick: () => void undo() },
    })
  );
  const mine = tasks.filter((t) => t.projectId === p.id);
  const blocked = blockedIds(mine);
  const row = (t: V3Task) => (
    <FlowItem key={t.id} task={t} all={mine} onTick={tick}>
      <Task
        layout="row"
        task={t}
        today={today}
        late={isOverdue(t, today)}
        onOpen={onOpenTask}
        hideProject
        hideEntry={!t.done && !!flowSteps(t)}
        className={blocked.has(t.id) ? "is-blocked" : undefined}
      />
    </FlowItem>
  );
  const list = (l: readonly V3Task[]) => (
    <div className="wk-list">
      <Capped list={l} render={row} />
    </div>
  );

  return (
    <div className="nx-swap wk-ppage" data-wk-ppage={p.id}>
      <div className="wk-phero" data-ctx="project" data-ctx-id={p.id}>
        <span
          aria-hidden="true"
          className="wk-phero-tile"
          style={{
            background: `color-mix(in oklab, ${hue} 24%, var(--background))`,
            color: hue,
          }}
        >
          {/* //todo Project.icon names a lucide glyph; map it once an icon
              registry exists for v3. */}
          <LuFolder size={22} />
        </span>
        <span className="wk-col wk-phero-text">
          <h1 className="wk-phero-name" title={p.name}>
            {p.name}
          </h1>
          <span className="wk-phero-stats wk-num">
            <span>{openLine(s)}</span>
            {s.done ? <span>{s.done} done</span> : null}
            {s.left ? <span>{wkMins(s.left)} left</span> : null}
            {s.late ? (
              <span
                className="wk-phero-late"
                title={`${s.late}${s.late === 1 ? " task was" : " tasks were"} due before today — move or let go`}
              >
                {s.late} overdue
              </span>
            ) : null}
          </span>
        </span>
        <span className="wk-phero-side">
          <span
            className="wk-phero-ring"
            title={`${Math.round(s.pct * 100)}% done`}
          >
            <Ring pct={s.pct} hue={hue} size={34} />
          </span>
          <MoreMenu
            label="Project options"
            onEdit={onEdit}
            onDelete={onDelete}
            deleteTitle={
              s.open
                ? `Its ${s.open} open ${s.open === 1 ? "task is" : "tasks are"} archived with it`
                : undefined
            }
          />
        </span>
      </div>
      <label
        className="wk-padd"
        data-wk-padd
        data-filled={draft.trim() ? "" : undefined}
      >
        <span aria-hidden="true" className="wk-padd-plus">
          <LuPlus size={15} />
        </span>
        <input
          ref={addRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Add a task to ${p.name}`}
          aria-label={`Add a task to ${p.name}`}
          autoComplete="off"
          enterKeyHint="done"
          onKeyDown={(e) => {
            // Enter inside an IME composition picks a candidate; it is not "add".
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
            if (e.key === "Escape") {
              setDraft("");
              e.currentTarget.blur();
            }
          }}
          className="wk-padd-input"
        />
        <span aria-hidden="true" className="wk-meta wk-padd-hint">
          Enter to add
        </span>
      </label>
      {groups.map((g) => (
        <Fold
          key={g.key}
          title={g.title}
          tone={g.tone}
          count={g.tasks.length}
          open={!fold[g.key]}
          onToggle={flip(g.key)}
          note={
            g.tone === "late"
              ? "These were due before today — move them or let them go."
              : undefined
          }
        >
          {list(g.tasks)}
        </Fold>
      ))}
      {done.length ? (
        <Fold
          title="Done"
          count={done.length}
          open={!fold.__done}
          onToggle={flip("__done")}
        >
          {list(done)}
        </Fold>
      ) : null}
      {!groups.length && !done.length ? (
        <WkEmpty
          art="task"
          title="Nothing in this project yet"
          line="Add the first task above, or move one here from its right-click menu."
          cta="Add task"
          onClick={() => addRef.current?.focus()}
        />
      ) : null}
    </div>
  );
}
