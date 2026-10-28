"use client";

/* Goals, desktop and phone (one face; the layout folds under 700 px).
   A goal is its own object, never a task: it has no time, no rail and no
   checkbox. What it shows is the why, the deadline, the area and progress.
   Rules from docs/handoff/PORT.md §0: greys are the text ladder, chrome type
   is 13/12 px, the accent is only a mark (the progress line), one form
   geometry (the habit sheet's). Presentational: data and writes come in
   through props, so it renders on the server for the tests. */
import { type ReactNode, useState } from "react";

import { LuCheck, LuFlag, LuPlus } from "react-icons/lu";

import { ProBadge } from "@/components/needt3/paywall/Pro";
import { SSelect } from "@/components/needt3/settings/kit";
import { PlEmpty } from "@/components/needt3/states/StScreen";

import {
  GOAL_AREAS,
  GOAL_AREA_LABELS,
  type GoalCheckInView,
  type GoalView,
  goalAreaLabel,
  goalProgressLabel,
} from "@/lib/goals";

export interface GoalTaskRow {
  id: string;
  title: string;
  status: string;
  goalId: string | null;
}

export interface GoalDetailData {
  goal: GoalView;
  subgoals: GoalView[];
  tasks: GoalTaskRow[];
  checkIns: GoalCheckInView[];
}

export interface GoalFormValues {
  title: string;
  description: string;
  deadline: string;
  area: string;
  parentId: string;
  targetValue: string;
  currentValue: string;
  unit: string;
}

export const EMPTY_GOAL_FORM: GoalFormValues = {
  title: "",
  description: "",
  deadline: "",
  area: "",
  parentId: "",
  targetValue: "",
  currentValue: "",
  unit: "",
};

export interface GoalsViewProps {
  goals: readonly GoalView[] | undefined;
  loading?: boolean;
  pro: boolean;
  selectedId: string | null;
  detail: GoalDetailData | undefined;
  /** Open tasks that can be linked to the selected goal. */
  linkable?: readonly { id: string; title: string }[];
  checkInOpen?: boolean;
  form: GoalFormValues | null;
  saving?: boolean;
  onSelect: (id: string | null) => void;
  onNew: () => void;
  onUpgrade: () => void;
  onFormChange: (form: GoalFormValues) => void;
  onFormClose: () => void;
  onFormSave: () => void;
  onCheckIn: (input: {
    value?: number;
    percent?: number;
    note?: string;
  }) => void;
  onStatus: (status: "active" | "achieved" | "dropped") => void;
  onArchive: () => void;
  onAddTask: (title: string) => void;
  onLinkTask: (taskId: string) => void;
  onToggleTask: (task: GoalTaskRow) => void;
}

function dayLabel(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The progress line: a fill-5 track, the accent as the mark. */
export function GoalBar({ goal }: { goal: GoalView }) {
  const pct = goal.progress.percent ?? 0;
  return (
    <span
      className="gl-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={goal.progress.percent ?? undefined}
      aria-label={`${goal.title} progress`}
      data-gl-bar={goal.progress.percent ?? "none"}
    >
      <span className="gl-bar-fill" style={{ width: `${pct}%` }} />
    </span>
  );
}

function metaLine(goal: GoalView) {
  return [
    goalAreaLabel(goal.area),
    goal.deadline ? `by ${dayLabel(goal.deadline)}` : null,
    goal.status === "achieved"
      ? "Achieved"
      : goal.status === "dropped"
        ? "Dropped"
        : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function GoalRow({
  goal,
  sub,
  selected,
  onSelect,
}: {
  goal: GoalView;
  sub?: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const label = goalProgressLabel(goal.progress);
  const meta = metaLine(goal);
  return (
    <button
      type="button"
      className={`gl-row nx-press nx-focus${sub ? " is-sub" : ""}${selected ? " is-on" : ""}`}
      data-gl-goal={goal.id}
      aria-pressed={selected}
      onClick={() => onSelect(goal.id)}
    >
      <span className="gl-row-main">
        <span className="gl-row-title">{goal.title}</span>
        {meta ? <span className="gl-row-meta">{meta}</span> : null}
      </span>
      <span className="gl-row-side">
        <span className="gl-row-progress" data-gl-progress={goal.id}>
          {label ?? "No progress yet"}
        </span>
        <GoalBar goal={goal} />
      </span>
    </button>
  );
}

function GoalList({
  goals,
  selectedId,
  onSelect,
}: {
  goals: readonly GoalView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [showClosed, setShowClosed] = useState(false);
  const top = goals.filter(
    (g) => !g.parentId || !goals.some((p) => p.id === g.parentId)
  );
  const children = (id: string) => goals.filter((g) => g.parentId === id);
  const open = top.filter((g) => g.status === "active");
  const closed = top.filter((g) => g.status !== "active");
  const block = (list: readonly GoalView[]) =>
    list.map((g) => (
      <div key={g.id} className="gl-group">
        <GoalRow goal={g} selected={selectedId === g.id} onSelect={onSelect} />
        {children(g.id).map((c) => (
          <GoalRow
            key={c.id}
            goal={c}
            sub
            selected={selectedId === c.id}
            onSelect={onSelect}
          />
        ))}
      </div>
    ));
  return (
    <div className="gl-list" data-gl-list>
      {block(open)}
      {closed.length ? (
        <>
          <button
            type="button"
            className="nx-btn nx-btn-text nx-btn-sm gl-closed-toggle"
            data-gl-closed={showClosed ? "open" : "shut"}
            onClick={() => setShowClosed(!showClosed)}
          >
            {showClosed
              ? "Hide closed goals"
              : `Closed goals (${closed.length})`}
          </button>
          {showClosed ? block(closed) : null}
        </>
      ) : null}
    </div>
  );
}

function CheckInForm({
  goal,
  autoFocus,
  onCheckIn,
}: {
  goal: GoalView;
  autoFocus?: boolean;
  onCheckIn: GoalsViewProps["onCheckIn"];
}) {
  const byValue = goal.targetValue !== null;
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const number = amount.trim() === "" ? null : Number(amount);
  const amountOk =
    number === null ||
    (Number.isFinite(number) && (byValue || (number >= 0 && number <= 100)));
  const ok = amountOk && (number !== null || note.trim() !== "");
  const send = () => {
    if (!ok) return;
    onCheckIn({
      ...(number !== null
        ? byValue
          ? { value: number }
          : { percent: Math.round(number) }
        : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setAmount("");
    setNote("");
  };
  return (
    <div className="gl-checkin" data-gl-checkin>
      <span className="gl-section-title">How&apos;s it going?</span>
      <div className="gl-checkin-row">
        <input
          name="goal-checkin-amount"
          className={`pl-field is-num gl-checkin-amount${amountOk ? "" : " is-invalid"}`}
          inputMode="decimal"
          placeholder={byValue ? `Now (${goal.unit ?? "value"})` : "Percent"}
          aria-label={byValue ? "Where it stands now" : "Percent done"}
          aria-invalid={!amountOk}
          value={amount}
          autoFocus={autoFocus}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          name="goal-checkin-note"
          className="pl-field"
          placeholder="A note (optional)"
          aria-label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
        />
        <button
          type="button"
          className="nx-btn nx-btn-secondary nx-btn-sm"
          data-gl-checkin-save
          disabled={!ok}
          onClick={send}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function GoalTasks({
  detail,
  linkable,
  onAddTask,
  onLinkTask,
  onToggleTask,
}: {
  detail: GoalDetailData;
  linkable: readonly { id: string; title: string }[];
  onAddTask: (title: string) => void;
  onLinkTask: (taskId: string) => void;
  onToggleTask: (task: GoalTaskRow) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const title = draft.trim();
    if (!title) return;
    onAddTask(title);
    setDraft("");
  };
  return (
    <div className="gl-tasks" data-gl-tasks>
      <span className="gl-section-title">Tasks</span>
      {detail.tasks.map((t) => {
        const done = t.status === "completed";
        return (
          <label key={t.id} className="gl-task" data-gl-task={t.id}>
            <input
              type="checkbox"
              checked={done}
              aria-label={`${done ? "Reopen" : "Done"}: ${t.title}`}
              onChange={() => onToggleTask(t)}
            />
            <span className={`gl-task-title${done ? " is-done" : ""}`}>
              {t.title}
            </span>
            {t.goalId !== detail.goal.id ? (
              <span className="gl-task-via">from a linked project</span>
            ) : null}
          </label>
        );
      })}
      <div className="gl-task-add">
        <LuPlus size={14} aria-hidden />
        <input
          name="goal-task-add"
          className="gl-task-input"
          placeholder="Add a task to this goal"
          aria-label="Add a task to this goal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
      </div>
      {linkable.length ? (
        <SSelect
          label="Link a task"
          width={240}
          value=""
          onChange={(v) => {
            if (v) onLinkTask(v);
          }}
          options={[
            ["", "Link a task…"],
            ...linkable.map((t) => [t.id, t.title] as const),
          ]}
        />
      ) : null}
    </div>
  );
}

function GoalPanel(props: GoalsViewProps & { detail: GoalDetailData }) {
  const { detail, onStatus, onArchive } = props;
  const g = detail.goal;
  const label = goalProgressLabel(g.progress);
  const meta = metaLine(g);
  return (
    <aside
      className="nx-swap gl-panel"
      data-gl-panel={g.id}
      aria-label={`Goal: ${g.title}`}
    >
      <div className="gl-panel-head">
        <h2 className="gl-panel-title">{g.title}</h2>
        {meta ? <span className="gl-row-meta">{meta}</span> : null}
      </div>
      {g.description ? <p className="gl-why">{g.description}</p> : null}
      <div className="gl-panel-progress">
        <span className="gl-panel-percent" data-gl-percent>
          {g.progress.percent === null ? "—" : `${g.progress.percent}%`}
        </span>
        <span className="gl-row-meta">{label ?? "No progress yet"}</span>
        <GoalBar goal={g} />
      </div>
      {g.status === "active" && g.progress.source !== "tasks" ? (
        <CheckInForm
          goal={g}
          autoFocus={props.checkInOpen}
          onCheckIn={props.onCheckIn}
        />
      ) : null}
      <GoalTasks
        detail={detail}
        linkable={props.linkable ?? []}
        onAddTask={props.onAddTask}
        onLinkTask={props.onLinkTask}
        onToggleTask={props.onToggleTask}
      />
      {detail.subgoals.length ? (
        <div className="gl-subgoals">
          <span className="gl-section-title">Subgoals</span>
          {detail.subgoals.map((s) => (
            <GoalRow
              key={s.id}
              goal={s}
              sub
              selected={false}
              onSelect={props.onSelect}
            />
          ))}
        </div>
      ) : null}
      {detail.checkIns.length ? (
        <div className="gl-history" data-gl-history>
          <span className="gl-section-title">Check-ins</span>
          {detail.checkIns.map((c) => (
            <span key={c.id} className="gl-history-row">
              <span className="gl-history-day">{dayLabel(c.createdAt)}</span>
              <span>
                {[
                  c.value !== null
                    ? `${c.value}${g.unit ? ` ${g.unit}` : ""}`
                    : null,
                  c.percent !== null ? `${c.percent}%` : null,
                  c.note,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          ))}
        </div>
      ) : null}
      <div className="gl-panel-actions">
        {g.status === "active" ? (
          <>
            <button
              type="button"
              className="nx-btn nx-btn-secondary nx-btn-sm"
              data-gl-achieve
              onClick={() => onStatus("achieved")}
            >
              <LuCheck size={14} aria-hidden />
              Achieved
            </button>
            <button
              type="button"
              className="nx-btn nx-btn-text nx-btn-sm"
              onClick={() => onStatus("dropped")}
            >
              Let it go
            </button>
          </>
        ) : (
          <button
            type="button"
            className="nx-btn nx-btn-secondary nx-btn-sm"
            onClick={() => onStatus("active")}
          >
            Reopen
          </button>
        )}
        <button
          type="button"
          className="nx-btn nx-btn-text nx-btn-sm gl-archive"
          onClick={onArchive}
        >
          Archive
        </button>
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="pl-stack-6">
      <span className="pl-label">{label}</span>
      {children}
    </label>
  );
}

function GoalSheet({
  form,
  goals,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  form: GoalFormValues;
  goals: readonly GoalView[];
  saving?: boolean;
  onChange: (form: GoalFormValues) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const set = (patch: Partial<GoalFormValues>) =>
    onChange({ ...form, ...patch });
  const ok = form.title.trim().length > 0 && !saving;
  const parents = goals.filter((g) => !g.parentId && g.status === "active");
  return (
    <div
      className="nx-scrim pl-habit-sheet-grid"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New goal"
        className="nx-sheet pl-habit-sheet pl-habit-sheet-col"
        data-gl-sheet
      >
        <div className="pl-row-12">
          <LuFlag size={28} aria-hidden />
          <span className="pl-habit-sheet-col-2">
            <span className="pl-sheet-title">New goal</span>
            <span className="pl-meta">
              What you are working towards. Never on the calendar.
            </span>
          </span>
        </div>
        <Field label="Goal">
          <input
            name="goal-title"
            className="pl-field"
            placeholder="Save 2 500 CHF"
            value={form.title}
            autoFocus
            onChange={(e) => set({ title: e.target.value })}
          />
        </Field>
        <Field label="Why">
          <textarea
            name="goal-why"
            className="pl-field gl-why-field"
            placeholder="What it changes for you"
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </Field>
        <Field label="Deadline">
          <input
            name="goal-deadline"
            type="date"
            className="pl-field"
            value={form.deadline}
            onChange={(e) => set({ deadline: e.target.value })}
          />
        </Field>
        <div className="pl-stack-6">
          <span className="pl-label">Area</span>
          <span className="gl-chips">
            {GOAL_AREAS.map((a) => (
              <button
                key={a}
                type="button"
                className={`pl-chip pl-habit-sheet-row-4${form.area === a ? " is-on" : ""}`}
                aria-pressed={form.area === a}
                onClick={() => set({ area: form.area === a ? "" : a })}
              >
                {GOAL_AREA_LABELS[a]}
              </button>
            ))}
          </span>
        </div>
        <div className="pl-stack-6">
          <span className="pl-label">Target (optional)</span>
          <span className="gl-target">
            <input
              name="goal-current"
              className="pl-field is-num"
              inputMode="decimal"
              placeholder="Now"
              aria-label="Where it stands now"
              value={form.currentValue}
              onChange={(e) => set({ currentValue: e.target.value })}
            />
            <input
              name="goal-target"
              className="pl-field is-num"
              inputMode="decimal"
              placeholder="Target"
              aria-label="Target"
              value={form.targetValue}
              onChange={(e) => set({ targetValue: e.target.value })}
            />
            <input
              name="goal-unit"
              className="pl-field"
              placeholder="Unit"
              aria-label="Unit"
              value={form.unit}
              onChange={(e) => set({ unit: e.target.value })}
            />
          </span>
        </div>
        {parents.length ? (
          <Field label="Part of">
            <SSelect
              label="Part of"
              width={240}
              value={form.parentId}
              onChange={(v) => set({ parentId: v })}
              options={[
                ["", "No parent goal"],
                ...parents.map((g) => [g.id, g.title] as const),
              ]}
            />
          </Field>
        ) : null}
        <div className="pl-habit-sheet-row-6">
          <button
            type="button"
            className="nx-btn nx-btn-text"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="nx-btn nx-btn-primary"
            data-gl-create
            disabled={!ok}
            onClick={onSave}
          >
            Create goal
          </button>
        </div>
      </div>
    </div>
  );
}

export function GoalsView(props: GoalsViewProps) {
  const { goals, pro, selectedId, detail, form } = props;
  const list = goals ?? [];
  const active = list.filter((g) => g.status === "active").length;
  const meta = pro ? (
    `${active} active ${active === 1 ? "goal" : "goals"} · never scheduled`
  ) : (
    <ProBadge locked feature="Goals" />
  );
  return (
    <div className="scroll-inner gl-screen" data-v3-screen="goals">
      <header className="pl-place-header-row">
        <button
          type="button"
          aria-label="New goal"
          title="New goal"
          data-page-add=""
          className="nx-btn nx-btn-secondary page-add"
          onClick={pro ? props.onNew : props.onUpgrade}
        >
          <LuPlus size={18} aria-hidden />
        </button>
        <h1 className="pl-place-header-text">Goals</h1>
        <span className="pl-place-header-text-2">{meta}</span>
      </header>
      {props.loading && !goals ? null : !list.length ? (
        pro ? (
          <PlEmpty
            art={<LuFlag size={40} aria-hidden />}
            title="No goals yet"
            line="Name one thing you are working towards. Link tasks to it, or update where it stands once a week."
            action={
              <button
                type="button"
                className="nx-btn nx-btn-primary"
                onClick={props.onNew}
              >
                <LuPlus size={14} aria-hidden />
                New goal
              </button>
            }
          />
        ) : (
          <PlEmpty
            art={<LuFlag size={40} aria-hidden />}
            title="Goals are part of Pro"
            line="Keep what you are working towards with its why, see progress from its tasks, and get a weekly check-in."
            action={
              <button
                type="button"
                className="nx-btn nx-btn-secondary"
                data-gl-upgrade
                onClick={props.onUpgrade}
              >
                See plans
              </button>
            }
          />
        )
      ) : (
        <div className={`gl-body${detail ? " has-panel" : ""}`}>
          <GoalList
            goals={list}
            selectedId={selectedId}
            onSelect={(id) => props.onSelect(id === selectedId ? null : id)}
          />
          {detail ? <GoalPanel {...props} detail={detail} /> : null}
        </div>
      )}
      {form ? (
        <GoalSheet
          form={form}
          goals={list}
          saving={props.saving}
          onChange={props.onFormChange}
          onClose={props.onFormClose}
          onSave={props.onFormSave}
        />
      ) : null}
    </div>
  );
}

/** A project's goals, under its header: title and progress, each a link. */
export function ProjectGoalsView({ goals }: { goals: readonly GoalView[] }) {
  const shown = goals.filter((g) => g.status === "active");
  if (!shown.length) return null;
  return (
    <div className="gl-project" data-gl-project>
      {shown.map((g) => (
        <a
          key={g.id}
          className="gl-project-goal nx-press nx-focus"
          href={g.href}
          data-gl-project-goal={g.id}
        >
          <LuFlag size={12} aria-hidden />
          <span className="gl-project-title">{g.title}</span>
          <span className="gl-project-pct">
            {g.progress.percent === null ? "—" : `${g.progress.percent}%`}
          </span>
          <GoalBar goal={g} />
        </a>
      ))}
    </div>
  );
}
