"use client";

import { type KeyboardEvent, useCallback, useRef, useState } from "react";

import {
  LuArrowRight,
  LuCheck,
  LuChevronDown,
  LuChevronRight,
  LuClock,
  LuDownload,
  LuPlus,
  LuRotateCcw,
  LuTarget,
  LuTrash2,
} from "react-icons/lu";

import { clock } from "@/lib/needt3/day";
import { addDays, at as hourAt } from "@/lib/needt3/derive";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useSetPref, useSettings } from "@/lib/needt3/hooks/settings";
import {
  useTask,
  useTaskParts,
  useTrashTask,
  useUpdateTask,
} from "@/lib/needt3/hooks/tasks";
import type { V3Task, V3TaskPatch } from "@/lib/needt3/map";

import { PkButton, PkField, PkGlass, PkSheet, pkCx } from "../kit";
import { PovFact, PovOpt, PovPickRow } from "./parts";
import { snack } from "./snack";
import {
  task as copy,
  movedToTrash,
  pick as pickCopy,
  prio as prioCopy,
} from "./strings";
import {
  CHUNK,
  DAYS,
  DEADLINE,
  EST,
  HOURS,
  PRIORITIES,
  anyTimePatch,
  chunkPatch,
  chunkWords,
  dayIsOn,
  dayPatch,
  deadlinePatch,
  dueWords,
  durationPatch,
  durationWords,
  hourPatch,
  noDayPatch,
  placementPatch,
  scheduleSummary,
  timeWords,
} from "./taskModel";
import { usePkToday } from "./today";
import { useAutosave } from "./useAutosave";

type SchedPick = "placement" | "chunk" | "deadline";

export interface PkTaskSheetProps {
  /** The task as the screen has it; the sheet follows the cache from there. */
  task: V3Task | null;
  open: boolean;
  onClose: () => void;
  /** "Start focus". What focus means on the phone is the shell's call. */
  onFocus?: (task: V3Task) => void;
}

/**
 * The task detail sheet (phone-overlays.jsx `PkTaskSheet`) on the kit's
 * PkSheet. Every edit saves at once through `useUpdateTask` (a quiet "Saved"
 * flashes; words wait for a pause); the footer's Done and Delete come back
 * through Undo. Owner-decided sections kept: First step and Scheduling.
 *
 * Not drawn, with the reason:
 * //todo Labels: a task has no label column.
 * //todo Hours (work / personal / any): there is no field for it on a task
 *   (`scheduleId` picks a schedule, and no hook lists them for the phone yet).
 * //todo Attachments: `TaskAttachment` (migration M2) has no route.
 */
export function PkTaskSheet({
  task,
  open,
  onClose,
  onFocus,
}: PkTaskSheetProps) {
  // The last task shown stays drawn while the sheet slides away; the body
  // is mounted only while the sheet is out, so a shut sheet holds no query.
  const held = useRef<V3Task | null>(null);
  if (task) held.current = task;
  const [alive, setAlive] = useState(false);
  if (open && !alive) setAlive(true);
  const t = task ?? held.current;
  if (!alive || !t) return null;
  return (
    <TaskSheetBody
      key={t.id}
      task={t}
      open={open}
      onClose={onClose}
      onFocus={onFocus}
      onShut={() => setAlive(false)}
    />
  );
}

function TaskSheetBody({
  task,
  open,
  onClose,
  onFocus,
  onShut,
}: PkTaskSheetProps & { task: V3Task; onShut: () => void }) {
  const today = usePkToday();
  const live = useTask(task.id).data;
  const t = live ?? task;
  const update = useUpdateTask();
  const trash = useTrashTask();
  const partsApi = useTaskParts();
  const projects = useProjects().data ?? [];
  const settings = useSettings().data;
  const setPref = useSetPref();

  const [saved, setSaved] = useState(0);
  const savedTimer = useRef(0);
  const flash = useCallback(() => {
    setSaved(1);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(0), 1400);
  }, []);

  const [fact, setFact] = useState<string | null>(null);
  const [pick, setPick] = useState<SchedPick | null>(null);
  const lastPick = useRef<SchedPick | null>(null);
  if (pick) lastPick.current = pick;
  const pickShown = pick ?? lastPick.current;
  const [newPart, setNewPart] = useState("");

  const edit = useCallback(
    (patch: V3TaskPatch) =>
      update
        .mutateAsync({ id: task.id, patch })
        .then((r) => {
          flash();
          return r;
        })
        // The hook has told the person and put the old fields back.
        .catch(() => null),
    [update, task.id, flash]
  );

  const title = useAutosave(t.title, (v) => void edit({ title: v }));
  const entry = useAutosave(
    t.entry ?? "",
    (v) => void edit({ entry: v || null })
  );
  const notes = useAutosave(
    t.notes ?? "",
    (v) => void edit({ notes: v || null })
  );
  const flushAll = () => {
    title.flush();
    entry.flush();
    notes.flush();
  };
  const close = () => {
    flushAll();
    onClose();
  };

  const toggleFact = (k: string) => () => setFact((f) => (f === k ? null : k));
  const late = !t.done && !t.noSlot && !!t.dueDate && t.dueDate < today;
  const at = timeWords(t);
  const parts = t.parts;
  const closed = parts.filter((p) => p.done).length;
  const wait = t.waits[0] ?? null;
  const project = projects.find((p) => p.id === t.projectId) ?? null;
  const schedOpen = settings?.prefs?.taskSchedOpen === true;

  const addPart = () => {
    const v = newPart.trim();
    if (!v) return;
    setNewPart("");
    void partsApi.add(t.id, v).then(flash, () => undefined);
  };
  const choose = (patch: V3TaskPatch) => {
    void edit(patch);
    setPick(null);
  };
  const setDone = (done: boolean) => {
    void edit({ done }).then((r) => {
      if (r && done) snack(copy.done, r.undo);
    });
  };
  const remove = () => {
    flushAll();
    onClose();
    void trash.trash(t.id).then(
      (r) => snack(movedToTrash, r.undo),
      () => undefined
    );
  };

  const schedRow = (
    k: SchedPick,
    label: string,
    value: string,
    muted?: boolean
  ) => (
    <button
      type="button"
      className="pov-srow"
      onClick={() => setPick(k)}
      aria-haspopup="dialog"
      data-pov-srow={k}
    >
      <span className="pov-srow-label">{label}</span>
      <span className={pkCx("pov-srow-value", muted && "is-muted")}>
        {value}
      </span>
      <span className="pov-srow-chev" aria-hidden="true">
        <LuChevronRight size={14} />
      </span>
    </button>
  );

  const PICK: Record<SchedPick, { title: string; body: React.ReactNode }> = {
    placement: {
      title: pickCopy.placement,
      body: (
        <>
          <PovPickRow
            on={!t.isFixed}
            onClick={() => choose(placementPatch(false))}
            hint={
              at
                ? `${pickCopy.planned} ${at} ${pickCopy.needt_may_move_it}`
                : pickCopy.needt_finds_the_slot
            }
            data={{ "data-pov-pick-opt": "auto" }}
          >
            {pickCopy.auto}
          </PovPickRow>
          <PovPickRow
            on={t.isFixed}
            onClick={() => choose(placementPatch(true))}
            hint={
              at
                ? `${pickCopy.stays_at} ${at}`
                : pickCopy.stays_where_you_put_it
            }
            data={{ "data-pov-pick-opt": "fixed" }}
          >
            {pickCopy.fixed}
          </PovPickRow>
        </>
      ),
    },
    chunk: {
      title: pickCopy.min_work_block,
      body: (
        <>
          {CHUNK.map((c) => (
            <PovPickRow
              key={String(c)}
              on={c == null ? !t.splitAllowed : t.splitAllowed && t.chunk === c}
              onClick={() => choose(chunkPatch(c))}
              hint={
                c
                  ? `${pickCopy.never_shorter_than} ${c} min`
                  : pickCopy.one_sitting_in_one_piece
              }
              data={{ "data-pov-pick-opt": String(c) }}
            >
              {c ? `${c} min` : pickCopy.dont_split}
            </PovPickRow>
          ))}
        </>
      ),
    },
    deadline: {
      title: pickCopy.deadline,
      body: (
        <>
          {DEADLINE.map(([label, n]) => {
            const v = addDays(today, n);
            return (
              <PovPickRow
                key={label}
                on={t.deadline === v}
                onClick={() => choose(deadlinePatch(n, today))}
                hint={
                  dueWords(v, today) === label ? undefined : dueWords(v, today)
                }
                data={{ "data-pov-pick-opt": String(n) }}
              >
                {label}
              </PovPickRow>
            );
          })}
          <PovPickRow
            on={!t.deadline}
            onClick={() => choose(deadlinePatch(null, today))}
            data={{ "data-pov-pick-opt": "none" }}
          >
            {pickCopy.no_deadline}
          </PovPickRow>
          <div className="pov-pick-switch">
            <span className="pov-pick-text">
              <span className="pov-pick-label">{pickCopy.hard_deadline}</span>
              <span className="pov-pick-hint">
                {pickCopy.needt_never_plans_it_past_this_day}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={t.hardDeadline}
              aria-label={pickCopy.hard_deadline}
              disabled={!t.deadline}
              className={pkCx("pov-switch", t.hardDeadline && "is-on")}
              onClick={() => void edit({ hardDeadline: !t.hardDeadline })}
              data-pov-hard=""
            >
              <span className="pov-switch-knob" />
            </button>
          </div>
        </>
      ),
    },
  };

  const head = (
    <div className="pov-task-top">
      <span className="pov-task-proj">
        {project ? (
          <span
            className="pov-hue"
            style={
              {
                "--hue": project.color ?? "var(--text-muted)",
              } as React.CSSProperties
            }
            aria-hidden="true"
          />
        ) : null}
        {project ? project.name : copy.no_project}
      </span>
      <span
        className="pov-saved"
        data-pov-saved={saved ? "1" : "0"}
        aria-live="polite"
      >
        <LuCheck size={12} />
        {copy.saved}
      </span>
    </div>
  );

  const footer = t.done ? (
    <PkButton
      kind="quiet"
      icon={<LuRotateCcw size={18} />}
      onClick={() => setDone(false)}
    >
      {copy.reopen}
    </PkButton>
  ) : (
    <>
      <PkButton
        kind="quiet"
        icon={<LuCheck size={18} />}
        className="pov-foot-side"
        onClick={() => setDone(true)}
        aria-label={copy.mark_done}
      >
        {copy.done}
      </PkButton>
      {onFocus ? (
        <PkButton
          kind="primary"
          icon={<LuTarget size={18} />}
          onClick={() => {
            flushAll();
            onFocus(t);
          }}
          data-pov-focus=""
        >
          {copy.start_focus}
        </PkButton>
      ) : null}
    </>
  );

  const idSuffix = t.id;
  return (
    <>
      <PkSheet
        open={open}
        onClose={() => (pick ? setPick(null) : close())}
        onShut={onShut}
        head={head}
        footer={footer}
        label={t.title || copy.task}
        className="pov-task"
        bodyClass="pov-task-body"
      >
        <div className="pov-title-row" data-pov-task={t.id}>
          <button
            type="button"
            className={pkCx("pov-ring", t.done && "is-on")}
            aria-pressed={t.done}
            aria-label={t.done ? copy.mark_not_done : copy.mark_done}
            onClick={() => setDone(!t.done)}
          >
            {t.done ? <LuCheck size={16} /> : null}
          </button>
          <label className="sr-only" htmlFor={`pov-title-${idSuffix}`}>
            {copy.title}
          </label>
          <PkField
            className="pov-title"
            id={`pov-title-${idSuffix}`}
            multiline
            grow
            rows={1}
            value={title.value}
            placeholder={copy.name_it}
            onChange={title.change}
          />
        </div>
        <div className="pov-step" data-pov-step="">
          <LuArrowRight size={14} />
          <label className="pov-step-label" htmlFor={`pov-entry-${idSuffix}`}>
            {copy.first_step}
          </label>
          <input
            id={`pov-entry-${idSuffix}`}
            className="pov-step-input"
            value={entry.value}
            placeholder={copy.the_smallest_thing_that_counts}
            onChange={(e) => entry.change(e.target.value)}
            onBlur={entry.flush}
            data-pov-entry=""
          />
        </div>
        {late ? (
          <p className="pov-late">
            {copy.overdue_this_was_due} {dueWords(t.dueDate, today)}
            {copy.move_it_or_let_it_go}
          </p>
        ) : null}
        {wait ? (
          <p className="pov-quiet-line">
            <LuClock size={13} />
            {copy.waiting_on} {wait.onName ?? wait.on} for {wait.for}
          </p>
        ) : null}

        <div className="pov-facts">
          <PovFact
            id="date"
            label={copy.date}
            value={t.dueDate ? dueWords(t.dueDate, today) : copy.no_date}
            muted={!t.dueDate}
            late={late}
            open={fact === "date"}
            onToggle={toggleFact("date")}
          >
            {DAYS.map(([label, n]) => (
              <PovOpt
                key={label}
                on={dayIsOn(t, n, today)}
                onClick={() => void edit(dayPatch(t, n, today))}
              >
                {label}
              </PovOpt>
            ))}
            <PovOpt on={!t.dueDate} onClick={() => void edit(noDayPatch())}>
              {copy.no_date}
            </PovOpt>
          </PovFact>
          <PovFact
            id="time"
            label={copy.time}
            value={
              at ? `${at}${t.isFixed ? "" : ` ${copy.auto_2}`}` : copy.any_time
            }
            muted={!at}
            open={fact === "time"}
            onToggle={toggleFact("time")}
          >
            {HOURS.map((h) => (
              <PovOpt
                key={h}
                on={hourAt(t) === h}
                onClick={() => void edit(hourPatch(t, h, today))}
              >
                {clock(h)}
              </PovOpt>
            ))}
            <PovOpt on={!at} onClick={() => void edit(anyTimePatch())}>
              {copy.any_time}
            </PovOpt>
          </PovFact>
          <PovFact
            id="duration"
            label={copy.duration}
            value={
              t.estimatedMinutes ? durationWords(t.estimatedMinutes) : copy.none
            }
            muted={!t.estimatedMinutes}
            open={fact === "duration"}
            onToggle={toggleFact("duration")}
          >
            {EST.map((m) => (
              <PovOpt
                key={m}
                on={t.estimatedMinutes === m}
                onClick={() => void edit(durationPatch(t, m))}
              >
                {durationWords(m)}
              </PovOpt>
            ))}
          </PovFact>
          <PovFact
            id="project"
            label={copy.project}
            value={project ? project.name : copy.none}
            muted={!project}
            open={fact === "project"}
            onToggle={toggleFact("project")}
          >
            {projects.map((p) => (
              <PovOpt
                key={p.id}
                hue={p.color ?? "var(--text-muted)"}
                on={t.projectId === p.id}
                onClick={() => void edit({ projectId: p.id })}
              >
                {p.name}
              </PovOpt>
            ))}
            <PovOpt
              on={!t.projectId}
              onClick={() => void edit({ projectId: null })}
            >
              {copy.none}
            </PovOpt>
          </PovFact>
          <PovFact
            id="priority"
            label={copy.priority}
            value={prioCopy[t.priority]}
            late={t.priority === "urgent"}
            open={fact === "priority"}
            onToggle={toggleFact("priority")}
          >
            {PRIORITIES.map(([k, label]) => (
              <PovOpt
                key={k}
                on={t.priority === k}
                onClick={() => void edit({ priority: k })}
              >
                {label}
              </PovOpt>
            ))}
          </PovFact>
        </div>

        <PkGlass
          as="section"
          className="pov-sched"
          aria-label={copy.scheduling}
          data-pov-sched={schedOpen ? "open" : "folded"}
        >
          <button
            type="button"
            className="pov-sched-head"
            aria-expanded={schedOpen}
            onClick={() => void setPref("taskSchedOpen", !schedOpen)}
            data-pov-sched-head=""
          >
            <span className="pov-sched-text">
              <span className="pov-sched-title">{copy.scheduling}</span>
              {schedOpen ? null : (
                <span className="pov-sched-sum">
                  {scheduleSummary(t, today)}
                </span>
              )}
            </span>
            <span
              className={pkCx("pov-sched-chev", schedOpen && "is-open")}
              aria-hidden="true"
            >
              <LuChevronDown size={16} />
            </span>
          </button>
          {schedOpen ? (
            <div className="pov-sched-rows">
              {schedRow(
                "placement",
                copy.placement,
                t.isFixed ? copy.fixed : copy.auto
              )}
              {schedRow(
                "chunk",
                copy.min_work_block,
                chunkWords(t),
                t.splitAllowed && !t.chunk
              )}
              {schedRow(
                "deadline",
                copy.deadline,
                t.deadline
                  ? `${t.hardDeadline ? `${copy.hard} ` : ""}${dueWords(t.deadline, today)}`
                  : copy.none,
                !t.deadline
              )}
            </div>
          ) : null}
        </PkGlass>

        <section className="pov-block" data-pov-subtasks="">
          <div className="pov-block-head">
            <span className="pk-label">{copy.subtasks}</span>
            {parts.length ? (
              <span className="pov-count">
                {closed} of {parts.length}
              </span>
            ) : null}
          </div>
          {parts.map((p) => (
            <div key={p.id} className={pkCx("pov-part", p.done && "is-done")}>
              <button
                type="button"
                className={pkCx("pov-ring is-small", p.done && "is-on")}
                aria-pressed={p.done}
                aria-label={`${p.done ? copy.reopen : copy.done_2} ${p.title}`}
                onClick={() =>
                  void partsApi.toggle(t.id, p).then(flash, () => undefined)
                }
              >
                {p.done ? <LuCheck size={12} /> : null}
              </button>
              <span className="pov-part-title">{p.title}</span>
            </div>
          ))}
          <div className="pov-part is-add">
            <span className="pov-part-plus" aria-hidden="true">
              <LuPlus size={14} />
            </span>
            <input
              className="pov-part-input"
              value={newPart}
              onChange={(e) => setNewPart(e.target.value)}
              placeholder={copy.add_a_subtask}
              aria-label={copy.add_a_subtask}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPart();
                }
              }}
              onBlur={addPart}
            />
          </div>
        </section>

        <section className="pov-block">
          <PkField
            label={copy.notes}
            id={`pov-notes-${idSuffix}`}
            multiline
            grow
            rows={2}
            value={notes.value}
            placeholder={copy.add_a_note}
            onChange={notes.change}
          />
        </section>

        {t.source ? (
          <p className="pov-quiet-line">
            <LuDownload size={12} />
            {copy.from} {t.source.kind}
            {t.source.quote ? ` · ${t.source.quote}` : ""}
          </p>
        ) : null}
        <div className="pov-delete-row">
          <PkButton
            kind="ghost"
            icon={<LuTrash2 size={18} />}
            className="pov-delete"
            onClick={remove}
          >
            {copy.delete_task}
          </PkButton>
        </div>
      </PkSheet>
      <PkSheet
        open={!!(open && pick)}
        onClose={() => setPick(null)}
        title={pickShown ? PICK[pickShown].title : ""}
        label={pickShown ? PICK[pickShown].title : copy.scheduling}
        className="pov-pick"
        bodyClass="pov-pick-body"
      >
        <div className="pov-pick-list" data-pov-pick={pickShown ?? ""}>
          {pickShown ? PICK[pickShown].body : null}
        </div>
      </PkSheet>
    </>
  );
}
