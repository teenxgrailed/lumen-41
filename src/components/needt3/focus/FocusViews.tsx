"use client";

/* THE FOCUS WINDOW'S THREE VIEWS (prototype focus.jsx): setup, running, end.
   Drawn by both faces — the desktop window and the phone sheet — from one
   controller, so crossing 700 px swaps the frame and nothing else. The views
   own no state that matters: the form is the controller's draft, the clock is
   the server's session. */
import { type ReactNode, useEffect, useRef, useState } from "react";

import {
  LuArrowRight,
  LuCheck,
  LuEyeOff,
  LuInfo,
  LuPlus,
  LuTarget,
  LuX,
} from "react-icons/lu";

import { cvDur, cvProject, project } from "@/lib/needt3/derive";
import {
  LENGTHS,
  type LengthChoice,
  SOUNDS,
  type Sound,
  clockOf,
  endsAt,
  lengthMinutes,
  taskChoices,
} from "@/lib/needt3/focus";
import { canFocusMore } from "@/lib/needt3/focus-done";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useTaskParts, useUpdateTask } from "@/lib/needt3/hooks/tasks";
import type { V3Task } from "@/lib/needt3/map";

import { GlassCard } from "../scenes";
import { FdEarlyAsk } from "./FdEarlyAsk";
import * as copy from "./strings";
import type { FocusController } from "./useFocusController";

/* Lucide glyphs react-icons' set does not carry under these names (pause,
   play, stop, the ambient sounds, minimise), drawn at the 24 grid. */
const GLYPHS: Record<string, [string, Record<string, string | number>][]> = {
  pause: [
    ["rect", { x: 6, y: 4, width: 4, height: 16, rx: 1 }],
    ["rect", { x: 14, y: 4, width: 4, height: 16, rx: 1 }],
  ],
  play: [
    [
      "path",
      {
        d: "M6 3.8v16.4a.8.8 0 0 0 1.2.7l13-8.2a.8.8 0 0 0 0-1.4l-13-8.2A.8.8 0 0 0 6 3.8z",
      },
    ],
  ],
  stop: [["rect", { x: 5, y: 5, width: 14, height: 14, rx: 2.5 }]],
  off: [
    [
      "path",
      {
        d: "M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z",
      },
    ],
    ["path", { d: "M22 9l-6 6" }],
    ["path", { d: "M16 9l6 6" }],
  ],
  rain: [
    ["path", { d: "M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2" }],
    ["path", { d: "M16 14v6" }],
    ["path", { d: "M8 14v6" }],
    ["path", { d: "M12 16v6" }],
  ],
  cafe: [
    ["path", { d: "M10 2v2" }],
    ["path", { d: "M14 2v2" }],
    ["path", { d: "M6 2v2" }],
    [
      "path",
      {
        d: "M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1",
      },
    ],
  ],
  noise: [
    [
      "path",
      {
        d: "M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
      },
    ],
    [
      "path",
      {
        d: "M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
      },
    ],
    [
      "path",
      {
        d: "M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
      },
    ],
  ],
  minimise: [
    ["path", { d: "M4 14h6v6" }],
    ["path", { d: "M20 10h-6V4" }],
    ["path", { d: "M14 10l7-7" }],
    ["path", { d: "M3 21l7-7" }],
  ],
};
GLYPHS.coffee = GLYPHS.cafe;

export function FcGlyph({ name, size = 16 }: { name: string; size?: number }) {
  const solid = name === "play" || name === "pause" || name === "stop";
  return (
    <svg
      className={"fc-glyph" + (solid ? " is-solid" : "")}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {(GLYPHS[name] ?? []).map(([tag, at], i) => {
        const P = tag as "path" | "rect";
        return <P key={i} {...at} />;
      })}
    </svg>
  );
}

/* A glass card pads inline (GlassCard's `pad` is a number), so the
   prototype's "16px 18px" goes through `style`. */
const PAD_CARD = { padding: "16px 18px" } as const;

/** Kicker + Exposure title on the sky, one round glass button on the right. */
function FcHead({
  kicker,
  title,
  sub,
  action,
  actionLabel,
  actionGlyph,
  onAction,
}: {
  kicker: string;
  title: string;
  sub?: string | null;
  action: string;
  actionLabel: string;
  actionGlyph?: string;
  onAction: () => void;
}) {
  return (
    <header className="fc-head" data-px-calm="">
      <div className="fc-head-text">
        <span className="px-kicker">{kicker}</span>
        <h2 className="px-display px-on-sky fc-title">{title}</h2>
        {sub ? <span className="px-on-sky fc-sub">{sub}</span> : null}
      </div>
      <button
        type="button"
        className="px-chip-btn fc-round"
        aria-label={actionLabel}
        title={actionLabel}
        onClick={onAction}
        data-fc-action={action}
      >
        {actionGlyph ? (
          <FcGlyph name={actionGlyph} size={15} />
        ) : (
          <LuX size={15} />
        )}
      </button>
    </header>
  );
}

function FcSeg<T extends string>({
  items,
  value,
  onChange,
  label,
  icons,
}: {
  items: readonly (readonly [T, string])[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  icons?: boolean;
}) {
  return (
    <div className="fc-seg px-track" role="radiogroup" aria-label={label}>
      {items.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          className={"fc-seg-btn" + (value === v ? " is-on" : "")}
          onClick={() => onChange(v)}
          data-fc-seg={v}
        >
          {icons ? <FcGlyph name={v} size={14} /> : null}
          {l}
        </button>
      ))}
    </div>
  );
}

const soundLabel = (v: Sound) =>
  v === "off"
    ? copy.sounds.off
    : v === "rain"
      ? copy.sounds.rain
      : v === "cafe"
        ? copy.sounds.caf
        : copy.sounds.white_noise;

/* ---------- setup ---------- */

function FcSetup({ ctl }: { ctl: FocusController }) {
  const projects = useProjects().data ?? [];
  const { draft, setDraft, openList } = ctl;
  const { minutes, bad } = lengthMinutes(draft.len, draft.custom);
  const list = taskChoices(openList, draft.taskId);
  const chosen = openList.find((t) => t.id === draft.taskId);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    if (bad || busy) return;
    setBusy(true);
    try {
      await ctl.begin();
    } finally {
      setBusy(false);
    }
  };
  const lengths: (readonly [LengthChoice, string])[] = LENGTHS.map((v) => [
    v,
    v === "custom" ? copy.lengths.custom : `${v} min`,
  ]);
  return (
    <div className="fc-stack">
      <FcHead
        kicker={ctl.ui.note ? copy.setup.break_over : copy.setup.focus_session}
        title={copy.setup.focus}
        sub={ctl.ui.note ?? copy.setup.one_thing_one_stretch_of_time}
        action="close"
        actionLabel={copy.CLOSE}
        onAction={ctl.close}
      />

      <GlassCard
        pad={0}
        radius={20}
        className="fc-card fc-card-form"
        style={PAD_CARD}
      >
        <label className="fc-group">
          <span className="fc-label">
            {copy.setup.what_is_this_session_for}
          </span>
          <input
            className="fc-field"
            data-fc-autofocus=""
            data-fc-purpose=""
            value={draft.purpose}
            onChange={(e) => setDraft({ purpose: e.target.value })}
            placeholder={
              chosen ? "e.g. " + chosen.title : copy.setup.e_g_the_first_draft
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") void start();
            }}
          />
        </label>
        <div className="fc-group">
          <span className="fc-label">{copy.setup.length}</span>
          <div className="fc-len-row">
            <FcSeg
              items={lengths}
              value={draft.len}
              onChange={(len) => setDraft({ len })}
              label={copy.setup.length}
            />
            {draft.len === "custom" ? (
              <span className={"fc-custom" + (bad ? " is-bad" : "")}>
                <input
                  className="fc-field fc-field-num"
                  inputMode="numeric"
                  aria-label={copy.setup.minutes}
                  aria-invalid={bad || undefined}
                  data-fc-custom=""
                  value={draft.custom}
                  onChange={(e) =>
                    setDraft({
                      custom: e.target.value.replace(/[^0-9]/g, "").slice(0, 3),
                    })
                  }
                />
                <span className="fc-unit">{copy.CUSTOM_MIN}</span>
              </span>
            ) : null}
          </div>
          {bad ? (
            <span className="fc-error">
              {copy.setup.pick_between_1_and_240_minutes}
            </span>
          ) : null}
        </div>
      </GlassCard>

      <div className="fc-group">
        <span className="fc-label fc-label-sky px-on-sky">
          {copy.setup.choose_a_task}
        </span>
        {list.length ? (
          <div className="fc-tasks" role="group" aria-label={copy.setup.task}>
            {list.map((t) => {
              const on = t.id === draft.taskId;
              const p = project(t.projectId, projects);
              const meta =
                [p?.name, t.estimatedMinutes ? cvDur(t.estimatedMinutes) : null]
                  .filter(Boolean)
                  .join(" · ") || copy.setup.no_project;
              return (
                <GlassCard
                  key={t.id}
                  pad={0}
                  radius={16}
                  strong={on}
                  best={on}
                  className="fc-task"
                  style={{ padding: "10px 14px" }}
                  aria-pressed={on}
                  data-fc-task={t.id}
                  label={t.title}
                  onClick={() => setDraft({ taskId: on ? "" : t.id })}
                >
                  <span
                    className="fc-ring"
                    style={
                      {
                        "--fc-hue": cvProject(t.projectId, projects).color,
                      } as React.CSSProperties
                    }
                    aria-hidden="true"
                  />
                  <span className="fc-task-text">
                    <span className="fc-task-title">{t.title}</span>
                    <span className="fc-task-meta">{meta}</span>
                  </span>
                  {on ? (
                    <span className="fc-task-check" aria-hidden="true">
                      <LuCheck size={13} />
                    </span>
                  ) : null}
                </GlassCard>
              );
            })}
          </div>
        ) : (
          <span className="fc-empty px-on-sky">
            {copy.setup.nothing_open_a_session_can_still_run_on_}
          </span>
        )}
      </div>

      <GlassCard
        pad={0}
        radius={20}
        className="fc-card fc-card-opts"
        style={PAD_CARD}
      >
        <div className="fc-opt">
          <span className="fc-label">{copy.setup.ambient_sound}</span>
          <FcSeg
            items={SOUNDS.map((v) => [v, soundLabel(v)] as const)}
            value={ctl.sound}
            onChange={ctl.setSound}
            label={copy.setup.ambient_sound}
            icons
          />
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={ctl.hide}
          className={"fc-switch-row" + (ctl.hide ? " is-on" : "")}
          onClick={() => ctl.setHide(!ctl.hide)}
          data-fc-hide=""
        >
          <LuEyeOff size={15} />
          <span className="fc-switch-label">{copy.setup.hide_other_tasks}</span>
          <span className="fc-switch" aria-hidden="true">
            <span className="fc-switch-knob" />
          </span>
        </button>
      </GlassCard>

      <div className="fc-foot">
        <button
          type="button"
          className="nx-btn nx-btn-primary fc-start"
          onClick={() => void start()}
          disabled={bad || busy}
          data-fc-start=""
        >
          <LuTarget size={15} />
          {copy.setup.start} {minutes} min
        </button>
        <span className="fc-info px-on-sky">
          <LuInfo size={13} />
          {copy.RULE}
        </span>
      </div>
    </div>
  );
}

/* ---------- running ---------- */

/** The task in the session: its subtasks to tick, its notes to write. */
function FcTaskCard({ task }: { task: V3Task }) {
  const update = useUpdateTask();
  const parts = useTaskParts();
  const [notes, setNotes] = useState(task.notes ?? "");
  const timer = useRef(0);
  const last = useRef(task.notes ?? "");
  const pending = useRef(notes);
  pending.current = notes;
  const write = (v: string) => {
    window.clearTimeout(timer.current);
    if (v === last.current) return;
    last.current = v;
    void update
      .mutateAsync({ id: task.id, patch: { notes: v || null } })
      .catch(() => undefined);
  };
  // A face swap unmounts this card: what is typed is written, not dropped.
  const flush = useRef(write);
  flush.current = write;
  useEffect(() => () => flush.current(pending.current), []);
  const doneN = task.parts.filter((p) => p.done).length;
  return (
    <GlassCard
      pad={0}
      radius={20}
      className="fc-card fc-card-task"
      style={PAD_CARD}
      data-fc-taskcard={task.id}
    >
      {task.parts.length ? (
        <div className="fc-group">
          <span className="fc-label">
            {copy.taskCard.subtasks}{" "}
            <span className="fc-count">
              {doneN}/{task.parts.length}
            </span>
          </span>
          <div className="fc-parts">
            {task.parts.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="checkbox"
                aria-checked={p.done}
                className={"fc-part" + (p.done ? " is-done" : "")}
                onClick={() =>
                  void parts.toggle(task.id, p).catch(() => undefined)
                }
                data-fc-part={i}
              >
                <span className="fc-box" aria-hidden="true">
                  {p.done ? <LuCheck size={11} /> : null}
                </span>
                <span className="fc-part-title">{p.title}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <label className="fc-group">
        <span className="fc-label">{copy.taskCard.notes}</span>
        <textarea
          className="fc-field fc-notes"
          rows={3}
          value={notes}
          placeholder={copy.taskCard.what_you_found_what_is_left}
          data-fc-notes=""
          onChange={(e) => {
            const v = e.target.value;
            setNotes(v);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => write(v), 500);
          }}
          onBlur={() => write(notes)}
        />
      </label>
    </GlassCard>
  );
}

/** End session's one confirm: takes the focus when it appears, so Enter ends
 *  and Esc (the window's) keeps going. */
function FcEndConfirm({
  onEnd,
  onKeep,
}: {
  onEnd: () => void;
  onKeep: () => void;
}) {
  const end = useRef<HTMLButtonElement>(null);
  useEffect(() => end.current?.focus({ preventScroll: true }), []);
  return (
    <>
      <button
        type="button"
        ref={end}
        className="nx-btn nx-btn-primary fc-ctl"
        onClick={onEnd}
        data-fc-end-confirm=""
      >
        {copy.endSession}
      </button>
      <button
        type="button"
        className="nx-btn nx-btn-secondary fc-ctl"
        onClick={onKeep}
        data-fc-end-cancel=""
      >
        {copy.keepGoing}
      </button>
    </>
  );
}

function FcRun({ ctl }: { ctl: FocusController }) {
  const { run, task } = ctl;
  if (!run) return null;
  const title = run.isBreak
    ? copy.run.break
    : (task?.title ?? run.intention ?? copy.run.focus);
  const purpose =
    !run.isBreak && run.intention && task && run.intention !== task.title
      ? run.intention
      : null;
  const cycle = () => {
    const i = SOUNDS.indexOf(ctl.sound);
    ctl.setSound(SOUNDS[(i + 1) % SOUNDS.length]);
  };
  const clock = clockOf(run);
  const ends = endsAt(run, ctl.nowMs, ctl.tz);
  const planned = run.plannedMinutes;
  const stopLabel = run.isBreak ? copy.endBreak : copy.endSession;
  const confirming = ctl.ui.confirmEnd && !run.isBreak;
  const focusedMin = Math.round(run.elapsedSec / 60);
  return (
    <div className="fc-stack fc-run">
      <FcHead
        kicker={
          run.paused
            ? copy.run.paused
            : run.isBreak
              ? copy.run.on_a_break
              : copy.run.in_focus
        }
        title={title}
        sub={purpose}
        action="minimise"
        actionLabel={copy.MINIMISE}
        actionGlyph="minimise"
        onAction={ctl.close}
      />

      <div className="fc-clock-wrap" data-px-calm="">
        <span
          className={
            "px-display px-on-sky fc-clock" + (run.paused ? " is-paused" : "")
          }
          data-fc-clock=""
          role="timer"
          aria-label={clock + (run.leftSec == null ? "" : " left")}
        >
          {clock}
        </span>
        {planned != null ? (
          <span className="fc-bar" aria-hidden="true">
            <span
              className="fc-bar-fill"
              style={{ "--fc-pct": run.pct } as React.CSSProperties}
            />
          </span>
        ) : null}
        <span className="fc-clock-meta px-on-sky">
          {planned != null ? copy.sessionLine(cvDur(planned), ends) : ""}
        </span>
      </div>

      <div className="fc-controls">
        <button
          type="button"
          className="nx-btn nx-btn-primary fc-ctl"
          onClick={ctl.togglePause}
          data-fc-pause=""
          data-fc-autofocus=""
        >
          <FcGlyph name={run.paused ? "play" : "pause"} size={14} />
          {run.paused ? copy.run.resume : copy.run.pause}
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-secondary fc-ctl"
          onClick={ctl.more}
          data-fc-more=""
        >
          <LuPlus size={14} />
          {copy.run["5_min"]}
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-secondary fc-ctl"
          onClick={() => void ctl.stop()}
          aria-expanded={confirming}
          data-fc-stop=""
        >
          <FcGlyph name="stop" size={13} />
          {stopLabel}
        </button>
        <button
          type="button"
          className="px-chip-btn fc-chip"
          onClick={cycle}
          data-fc-sound={ctl.sound}
          title={copy.run.ambient_sound_click_to_change}
          aria-label={`${copy.run.ambient_sound} ${soundLabel(ctl.sound)}`}
        >
          <FcGlyph name={ctl.sound} size={14} />
          {soundLabel(ctl.sound)}
        </button>
      </div>

      {confirming ? (
        <GlassCard
          pad={0}
          radius={20}
          className="fc-card fc-card-end"
          style={PAD_CARD}
          data-fc-confirm=""
          role="alertdialog"
          aria-label={copy.endSession}
        >
          <span className="fc-end-line">
            {copy.endAsk(
              copy.focusedSoFar(focusedMin >= 1 ? cvDur(focusedMin) : null)
            )}
          </span>
          <span className="fc-end-actions">
            <FcEndConfirm
              onEnd={() => void ctl.endNow()}
              onKeep={ctl.keepGoing}
            />
          </span>
        </GlassCard>
      ) : null}

      {ctl.askingFullTime && task ? (
        <FdEarlyAsk
          title={task.title}
          leftMin={ctl.fullTimeLeftMin ?? 0}
          plannedMin={run.plannedMinutes}
          onKeep={ctl.keepGoingFullTime}
          onEnd={() => void ctl.endFullTimeNow()}
        />
      ) : null}

      {task && !run.isBreak ? (
        <FcTaskCard key={task.id} task={task} />
      ) : run.isBreak ? (
        <GlassCard
          pad={0}
          radius={20}
          className="fc-card fc-card-note"
          style={PAD_CARD}
        >
          <span className="fc-break-line">
            <FcGlyph name="coffee" size={16} />
            {copy.run.stand_up_drink_some_water_look_at_someth}
          </span>
        </GlassCard>
      ) : null}
    </div>
  );
}

/* ---------- end ---------- */

/** "Done with <task>?": Done is the default and takes the focus, so Enter
 *  closes the task; Not yet puts the question away; +15 min is offered only
 *  when the clock ran out. */
function FcDoneAsk({ ctl, title }: { ctl: FocusController; title: string }) {
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => done.current?.focus({ preventScroll: true }), []);
  const more = ctl.ui.summary ? canFocusMore(ctl.ui.summary.how) : false;
  return (
    <GlassCard
      pad={0}
      radius={20}
      className="fc-card fc-card-end"
      style={PAD_CARD}
      data-fc-done-ask=""
      role="group"
      aria-label={copy.doneAsk(title)}
    >
      <span className="fc-end-line">{copy.doneAsk(title)}</span>
      <span className="fc-end-actions">
        <button
          type="button"
          ref={done}
          className="nx-btn nx-btn-primary fc-ctl"
          onClick={() => void ctl.markDone()}
          data-fc-done=""
        >
          <LuCheck size={14} />
          {copy.doneLabel}
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-secondary fc-ctl"
          onClick={ctl.notYet}
          data-fc-not-yet=""
        >
          {copy.notYet}
        </button>
        {more ? (
          <button
            type="button"
            className="nx-btn nx-btn-secondary fc-ctl"
            onClick={() => void ctl.focusMore()}
            data-fc-more-focus=""
          >
            <LuPlus size={14} />
            {copy.moreFocus}
          </button>
        ) : null}
      </span>
    </GlassCard>
  );
}

function FcEnd({ ctl }: { ctl: FocusController }) {
  const summary = ctl.ui.summary;
  if (!summary) return null;
  const { stats, next } = ctl;
  const minutesToday = stats?.minutesToday ?? summary.minutes;
  const sessions = stats?.sessionsWeek ?? (summary.minutes >= 1 ? 1 : 0);
  const streak = stats?.streak ?? 0;
  const pieces: {
    id: string;
    glyph: ReactNode;
    title: string;
    sub: string;
    on: (() => void) | null;
  }[] = [
    {
      id: "next",
      glyph: <LuArrowRight size={16} />,
      title: copy.end.next_task,
      sub: next ? next.title : copy.end.nothing_else_open,
      on: next ? () => ctl.pickNext(next) : null,
    },
    {
      id: "break",
      glyph: <FcGlyph name="coffee" size={16} />,
      title: copy.end.take_a_5_min_break,
      sub: copy.end.starts_now_then_back_to_setup,
      on: () => void ctl.takeBreak(),
    },
    {
      id: "done",
      glyph: <LuCheck size={16} />,
      title: copy.end.done_for_now,
      sub: copy.end.close_and_get_back_to_the_day,
      on: ctl.done,
    },
  ];
  const mins =
    summary.minutes < 1 ? copy.end.under_a_minute : cvDur(summary.minutes);
  const ask = ctl.asking ? <FcDoneAsk ctl={ctl} title={summary.title} /> : null;
  if (summary.bare) {
    // Opened from a Focus-ended push: the question and nothing else.
    return (
      <div className="fc-stack fc-end">
        <FcHead
          kicker={copy.end.session_complete}
          title={summary.title}
          sub=""
          action="close"
          actionLabel={copy.CLOSE}
          onAction={ctl.done}
        />
        {ask}
      </div>
    );
  }
  return (
    <div className="fc-stack fc-end">
      <FcHead
        kicker={
          summary.how === "complete"
            ? copy.end.session_complete
            : copy.end.session_ended
        }
        title={mins}
        sub={"on " + summary.title}
        action="close"
        actionLabel={copy.CLOSE}
        onAction={ctl.done}
      />
      {ask}
      <GlassCard
        pad={0}
        radius={20}
        className="fc-card fc-stats"
        data-fc-stats=""
      >
        <span className="fc-stat">
          <span className="fc-stat-num">{sessions}</span>
          <span className="fc-stat-label">
            {sessions === 1 ? "session this week" : "sessions this week"}
          </span>
        </span>
        <span className="fc-stat">
          <span className="fc-stat-num">{cvDur(minutesToday)}</span>
          <span className="fc-stat-label">{copy.end.focused_today}</span>
        </span>
        <span className="fc-stat">
          <span className="fc-stat-num">{streak}</span>
          <span className="fc-stat-label">
            {streak === 1 ? copy.end.day_in_a_row : copy.end.days_in_a_row}
          </span>
        </span>
      </GlassCard>
      <div className="fc-group">
        <span className="fc-label fc-label-sky px-on-sky">
          {copy.end.what_next}
        </span>
        <div className="fc-next">
          {pieces.map((p, i) => (
            <GlassCard
              key={p.id}
              pad={0}
              radius={16}
              className={"fc-next-card" + (p.on ? "" : " is-off")}
              style={{ padding: "14px 16px 16px" }}
              onClick={p.on ?? undefined}
              label={p.title}
              data-fc-next={p.id}
              data-fc-autofocus={i === 0 && p.on ? "" : undefined}
              aria-disabled={p.on ? undefined : "true"}
            >
              <span className="fc-next-glyph">{p.glyph}</span>
              <span className="fc-next-title">{p.title}</span>
              <span className="fc-next-sub">{p.sub}</span>
            </GlassCard>
          ))}
        </div>
      </div>
      <span className="fc-info px-on-sky">
        <LuInfo size={13} />
        {copy.RULE}
      </span>
    </div>
  );
}

/** The current view, rising in when it changes (260 ms; reduced motion fades). */
export function FocusView({ ctl }: { ctl: FocusController }) {
  return (
    <div
      key={ctl.view}
      className={"fc-view fc-view-" + ctl.view}
      data-fc-view={ctl.view}
    >
      {ctl.view === "run" ? (
        <FcRun ctl={ctl} />
      ) : ctl.view === "end" ? (
        <FcEnd ctl={ctl} />
      ) : (
        <FcSetup ctl={ctl} />
      )}
    </div>
  );
}
