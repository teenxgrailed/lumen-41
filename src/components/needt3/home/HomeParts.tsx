"use client";

import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useState,
} from "react";

import {
  FiCalendar,
  FiCheck,
  FiChevronDown,
  FiLock,
  FiPlus,
  FiTarget,
} from "react-icons/fi";
import { LuWandSparkles } from "react-icons/lu";

import { Art } from "@/components/needt3/menu/Art";
import { Tooltip } from "@/components/needt3/menu/Tooltip";
import { Task } from "@/components/needt3/task/Task";
import { TaskCheck } from "@/components/needt3/task/TaskCheck";

import { hhmm } from "@/lib/needt3/derive";
import type { V3Habit, V3Task } from "@/lib/needt3/map";

import {
  type Capacity,
  HOME_CAP,
  type NextUp,
  type ScheduleItem,
  type WeekDay,
  cappedCount,
  dur,
  hours,
  nowIndex,
  scheduleWindow,
} from "./derive";

/* The Home pieces ($P/HomeToday.jsx). Pure drawing: the screen owns state. */

/**
 * The person's plan as Home reads it: true = known paid, false = known Free,
 * null = not known yet (loading or failed). While null nothing Pro-only is
 * unlocked and nothing is upsold.
 */
export type ProState = boolean | null;

export const Pill = ({ pro }: { pro: ProState }) => {
  const locked = pro === false;
  return (
    <span
      className={`pro-badge is-sm${locked ? " is-locked" : ""}`}
      data-pro-badge={pro ? "on" : locked ? "locked" : "unknown"}
      aria-label={locked ? "Pro feature — locked" : "Pro feature"}
    >
      {locked ? <FiLock size={8} aria-hidden /> : null}PRO
    </span>
  );
};

/** A section's rows, capped: a quiet "Show all N" under a long list. */
export function Capped<T extends { id: string }>({
  list,
  render,
}: {
  list: readonly T[];
  render: (item: T) => ReactNode;
}) {
  const [all, setAll] = useState(false);
  const { over, shown } = cappedCount(list.length, all);
  return (
    <>
      {list.slice(0, shown).map(render)}
      {over ? (
        <button
          type="button"
          className="nx-btn nx-btn-text nx-btn-sm hd-more"
          data-hd-more={all ? "less" : "all"}
          onClick={() => setAll(!all)}
          title={
            all
              ? `Show the first ${HOME_CAP} only`
              : `${list.length - HOME_CAP} more not shown`
          }
        >
          {all ? "Show fewer" : `Show all ${list.length}`}
        </button>
      ) : null}
    </>
  );
}

/** Craft's section: a chevron that folds, the name, a quiet count, an action. */
export function Fold({
  title,
  count,
  open,
  onToggle,
  action,
  tone,
  note,
  children,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  action?: ReactNode;
  tone?: "late";
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="hd-fold">
      <header className="hd-fold-head">
        <button
          type="button"
          className={`hd-chev hd-fold-chev${open ? "" : " is-shut"}`}
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Fold" : "Unfold"} ${title}`}
        >
          <FiChevronDown size={14} aria-hidden />
        </button>
        <span
          onClick={onToggle}
          title={title.length > 32 ? title : undefined}
          className={`hd-fold-title${tone === "late" ? " is-late" : ""}`}
        >
          {title}
        </span>
        {count ? <span className="hd-fold-count">{count}</span> : null}
        <span className="hd-fold-action">{action}</span>
      </header>
      {note ? <p className="hd-fold-note">{note}</p> : null}
      <div className={`nx-fold${open ? "" : " is-shut"}`} aria-hidden={!open}>
        <div className="hd-fold-body">{children}</div>
      </div>
    </section>
  );
}

/** The summary card: the Tasks mini-card frame holding a number or an action. */
export function Card({
  hue,
  className = "",
  title,
  label,
  children,
}: {
  hue: string;
  className?: string;
  title?: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`hd-card nx-swap tk-card ${className}`}
      title={title}
      style={{
        background: `color-mix(in oklab, ${hue} 22%, var(--background))`,
      }}
    >
      <div aria-label={label} className="tk-card-plate">
        {children}
      </div>
    </div>
  );
}

export const CardLabel = ({
  text,
  right,
}: {
  text: string;
  right?: ReactNode;
}) => (
  <div className="tk-card-label">
    <span>{text}</span>
    {right ? <span className="tk-card-right">{right}</span> : null}
  </div>
);

/** $P/work.jsx Ring: progress as an arc. The fill's transition is in tasks.css. */
export function Ring({
  pct,
  hue,
  size = 22,
}: {
  pct: number;
  hue: string;
  size?: number;
}) {
  const r = size / 2 - 2.5;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="wk-ring"
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--fill-5)"
        strokeWidth="2.5"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={hue}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, pct)))}
        className="wk-ring-fill"
      />
    </svg>
  );
}

export function ProgressCard({
  done,
  total,
  mins,
  closed,
  empty,
}: {
  done: number;
  total: number;
  mins: number;
  closed: boolean;
  empty: boolean;
}) {
  const pct = total ? done / total : 0;
  return (
    <Card
      hue="var(--accent)"
      className="hd-card-progress hd-card-sm"
      label="Progress"
    >
      <CardLabel
        text="Progress"
        right={
          <span
            title={`${Math.round(pct * 100)}% of today's tasks done`}
            className="hd-card-ring"
          >
            <Ring pct={pct} hue="var(--accent)" />
          </span>
        }
      />
      <div className="hd-card-foot">
        <span className="hd-card-stack">
          <span key={done} className="nx-swap hd-progress-n hd-card-big">
            {empty ? "Nothing due" : `${done} of ${total} done`}
          </span>
          <span className="hd-card-sub">
            {closed
              ? "All of today is closed"
              : empty
                ? "A clear day"
                : `${dur(mins) || "0 min"} of work left`}
          </span>
        </span>
      </div>
    </Card>
  );
}

/**
 * NEXT UP. The main accent of the screen: a compact card with the pick, why
 * it is the pick, and the actions.
 */
export function NextUpCard({
  pick,
  note,
  onOpen,
  onFocus,
  onDone,
  onSkip,
}: {
  pick: NextUp;
  note: string;
  onOpen: (id: string) => void;
  onFocus: () => void;
  onDone: () => void;
  onSkip: () => void;
}) {
  return (
    <Task
      layout="card"
      task={pick.task}
      label="Next up"
      note={note}
      onOpen={onOpen}
      onToggle={onDone}
      className="hd-card-next hd-next"
    >
      <button
        type="button"
        className="nx-btn nx-btn-primary hd-next-focus"
        onClick={onFocus}
      >
        <FiTarget size={15} aria-hidden />
        Start focus
      </button>
      <button
        type="button"
        className="nx-btn nx-btn-secondary"
        onClick={onDone}
      >
        <FiCheck size={14} aria-hidden />
        Done
      </button>
      {pick.canSkip ? (
        <button
          type="button"
          className="nx-btn nx-btn-sm nx-btn-text"
          onClick={onSkip}
        >
          Skip
        </button>
      ) : null}
    </Task>
  );
}

export function NextUpNone({ closed }: { closed: boolean }) {
  return (
    <Card hue="var(--text-primary)" className="hd-card-next" label="Next up">
      <CardLabel text="Next up" />
      <div className="hd-next-none">
        <span className="hd-next-none-title">
          {closed ? "Nothing left today" : "Nothing open"}
        </span>
        <span className="hd-meta-t">
          {closed
            ? "Tomorrow is a tab away — Week ahead."
            : "Add a task, or let Needt plan the day."}
        </span>
      </div>
    </Card>
  );
}

export interface HabitChip {
  habit: V3Habit;
  on: boolean;
  tip: string;
}

/** The habits block: a chip per habit, ticking one writes today's check-in. */
export function HabitsCard({
  chips,
  onToggle,
}: {
  chips: readonly HabitChip[];
  onToggle: (habit: V3Habit, done: boolean) => void;
}) {
  const kept = chips.filter((c) => c.on).length;
  const key = (h: V3Habit, on: boolean) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle(h, !on);
    }
  };
  return (
    <Card
      hue="var(--text-primary)"
      className="hd-card-habits hd-card-sm"
      label="Habits"
    >
      <CardLabel
        text="Habits"
        right={
          chips.length ? (
            <span key="k">
              {kept} of {chips.length} kept
            </span>
          ) : null
        }
      />
      <div className="hd-chips">
        {chips.length ? (
          chips.map(({ habit: h, on, tip }) => (
            <Tooltip key={h.id} label={tip} side="bottom">
              <div
                role="button"
                tabIndex={0}
                aria-pressed={on}
                data-ctx="habit"
                data-ctx-id={h.id}
                className={`hd-habit hd-chip${on ? " is-on" : ""}`}
                onClick={() => onToggle(h, !on)}
                onKeyDown={key(h, on)}
              >
                <TaskCheck on={on} hue="var(--success)" />
                <span className="hd-chip-name">{h.title}</span>
              </div>
            </Tooltip>
          ))
        ) : (
          <span className="hd-meta-t">No habits yet — add one on Habits.</span>
        )}
      </div>
    </Card>
  );
}

export function WeekStats({
  tasks,
  done,
  planned,
  cap,
  overdue,
}: {
  tasks: number;
  done: number;
  planned: number;
  cap: number;
  overdue: number;
}) {
  const pct = cap ? Math.min(1, planned / cap) : 0;
  return (
    <>
      <Card
        hue="var(--accent)"
        className="hd-card-progress hd-card-sm"
        label="This week"
      >
        <CardLabel text="This week" />
        <div className="hd-card-foot">
          <span className="hd-card-stack">
            <span className="hd-card-big hd-num">
              {tasks} {tasks === 1 ? "task" : "tasks"}
            </span>
            <span className="hd-card-sub">
              {tasks
                ? `${done} done · ${tasks - done} open`
                : "Nothing planned yet"}
            </span>
          </span>
        </div>
      </Card>
      <Card
        hue="var(--text-primary)"
        className="hd-card-streak hd-card-sm"
        label="Hours planned"
        title={`${hours(planned)} planned against ${hours(cap)} of working hours this week`}
      >
        <CardLabel
          text="Hours planned"
          right={
            <span key="r" className="hd-card-ring">
              <Ring pct={pct} hue="var(--accent)" />
            </span>
          }
        />
        <div className="hd-card-foot">
          <span className="hd-card-stack">
            <span className="hd-card-big hd-num">{hours(planned)}</span>
            {planned > cap ? (
              <span className="hd-card-sub is-late">
                {hours(planned - cap)} more than {hours(cap)} of working time
              </span>
            ) : (
              <span className="hd-card-sub">of {hours(cap)} working time</span>
            )}
          </span>
        </div>
      </Card>
      <Card
        hue={overdue ? "var(--destructive)" : "var(--text-primary)"}
        className="hd-card-habits hd-card-sm"
        label="Overdue"
        title={
          overdue
            ? `${overdue} ${overdue === 1 ? "task was" : "tasks were"} due before today and are still open`
            : "Nothing left behind"
        }
      >
        <CardLabel text="Overdue" />
        <div className="hd-card-foot">
          <span className="hd-card-stack">
            <span className={`hd-card-big hd-num${overdue ? " is-late" : ""}`}>
              {overdue ? `${overdue} overdue` : "Nothing overdue"}
            </span>
            <span className="hd-card-sub hd-card-clip">
              {overdue
                ? "Due before today and still open — they eat into this week."
                : "Nothing from before today is still open."}
            </span>
          </span>
        </div>
      </Card>
    </>
  );
}

export function PlanButton({
  pro,
  canPlan,
  onPlan,
  onLocked,
  primary,
  small,
}: {
  pro: ProState;
  canPlan: boolean;
  onPlan: () => void;
  onLocked: () => void;
  primary?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      data-agent-plan={primary ? "" : undefined}
      data-hd-plan={pro ? "on" : pro === false ? "locked" : "unknown"}
      className={`nx-btn nx-btn-secondary${small ? " nx-btn-sm" : ""}`}
      disabled={pro === null || (pro && !canPlan)}
      onClick={pro ? onPlan : pro === false ? onLocked : undefined}
      title={
        pro === null
          ? "Checking your plan"
          : !pro
            ? "Unlock Plan my day with Pro"
            : canPlan
              ? "Place what has no time yet into today's free hours"
              : "Everything already has a time"
      }
    >
      <LuWandSparkles size={small ? 14 : 15} aria-hidden />
      Plan my day
      <Pill pro={pro} />
    </button>
  );
}

/** NOTHING PLANNED. The calm empty day: a picture, one line, a way in. */
export function EmptyDay({
  onNew,
  plan,
}: {
  onNew: () => void;
  plan: ReactNode;
}) {
  return (
    <div data-hd-empty="1" className="nx-swap hd-empty">
      <Art name="event" size={56} />
      <h2 className="hd-empty-title">Nothing planned for today</h2>
      <p className="hd-empty-line">
        A clear day. Add what matters, or let Needt fill the free hours.
      </p>
      <div className="hd-empty-acts">
        <button type="button" className="nx-btn nx-btn-primary" onClick={onNew}>
          <FiPlus size={14} aria-hidden />
          New task
        </button>
        {plan}
      </div>
    </div>
  );
}

/** DAY CLOSED. A calm stop across the full width, with the two next steps. */
export function DayClosed({
  count,
  mins,
  habits,
  lateN,
  onPlan,
  onUndo,
}: {
  count: number;
  mins: number;
  habits: number;
  lateN: number;
  onPlan: () => void;
  onUndo: () => void;
}) {
  return (
    <div className="nx-sheet hd-closed" data-hd-closed="">
      <Art name="task" size={56} />
      <div className="hd-closed-text">
        <h2 className="hd-closed-title">All done for today</h2>
        <p className="hd-closed-line">
          {count} {count === 1 ? "task" : "tasks"} · {dur(mins) || "0 min"} of
          work · {habits} {habits === 1 ? "habit" : "habits"} kept.{" "}
          {lateN
            ? `${lateN} overdue ${lateN === 1 ? "task is" : "tasks are"} still open.`
            : "The rest of the evening is yours."}
        </p>
      </div>
      <div className="hd-closed-acts">
        <button type="button" className="nx-btn nx-btn-text" onClick={onUndo}>
          Undo last
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-primary"
          onClick={onPlan}
        >
          See tomorrow
        </button>
      </div>
    </div>
  );
}

const clock = (h: number) => hhmm(h) ?? "";

/** TODAY'S SCHEDULE. Events and timed tasks with the now line where it falls. */
export function Schedule({
  items,
  nowHour,
  hueOf,
  evCount,
  onOpen,
  onCalendar,
}: {
  items: readonly ScheduleItem[];
  nowHour: number;
  hueOf: (projectId: string | null) => string;
  evCount: number;
  onOpen: (id: string) => void;
  onCalendar: () => void;
}) {
  const [all, setAll] = useState(false);
  const nowAt = nowIndex(items, nowHour);
  const rows: ReactNode[] = [];
  const nowLine = (
    <div key="__now" className="hd-now" title={`Now · ${clock(nowHour)}`}>
      <span className="hd-now-time">{clock(nowHour)}</span>
      <span aria-hidden="true" className="hd-now-dot" />
      <span aria-hidden="true" className="hd-now-line" />
    </div>
  );
  items.forEach((x, i) => {
    if (i === nowAt) rows.push(nowLine);
    const past = x.at + x.len / 60 <= nowHour;
    const live = x.at <= nowHour && !past;
    rows.push(
      <div
        key={x.key}
        className="hd-sched-row hd-sched-item"
        data-ctx={x.event ? undefined : "task"}
        data-ctx-id={x.event ? undefined : (x.id ?? undefined)}
        onClick={() => !x.event && x.id && onOpen(x.id)}
        title={`${x.title} · ${clock(x.at)}${x.len ? ` · ${dur(x.len)}` : ""}`}
        style={
          live ? ({ background: "var(--fill-2)" } as CSSProperties) : undefined
        }
      >
        <span className={`hd-sched-time${past ? " is-past" : ""}`}>
          {clock(x.at)}
        </span>
        <span
          aria-hidden="true"
          className={`hd-sched-rail${past || x.done ? " is-dim" : ""}`}
          style={{ background: x.event ? "var(--fill-5)" : hueOf(x.projectId) }}
        />
        <span
          className={`hd-sched-title${x.event ? " is-event" : ""}${x.done ? " is-done" : past ? " is-past" : ""}`}
        >
          {x.event ? (
            <span className="hd-sched-ico">
              <FiCalendar size={12} aria-hidden />
            </span>
          ) : null}
          {x.title}
        </span>
        <span className="hd-sched-dur">{dur(x.len)}</span>
      </div>
    );
  });
  if (nowAt < 0) rows.push(nowLine);
  const vis = scheduleWindow(rows, rows.indexOf(nowLine), all);
  const taskN = items.length - evCount;
  return (
    <section className="hd-sched hd-panel">
      <header className="hd-sched-head">
        <span className="hd-sched-heading">
          <span className="hd-panel-title">Today&apos;s schedule</span>
          <span className="hd-meta-t hd-num">
            {evCount} {evCount === 1 ? "event" : "events"} · {taskN} timed{" "}
            {taskN === 1 ? "task" : "tasks"}
          </span>
        </span>
        <button type="button" className="hd-link hd-push" onClick={onCalendar}>
          Calendar
        </button>
      </header>
      <div className="hd-sched-list">
        {items.length ? (
          vis
        ) : (
          <span className="hd-sched-none">Nothing timed today.</span>
        )}
      </div>
      {vis.length < rows.length || all ? (
        <button
          type="button"
          className="hd-link hd-sched-more"
          data-hd-sched-more=""
          onClick={() => setAll(!all)}
        >
          {all ? "Show around now" : `Show all ${items.length}`}
        </button>
      ) : null}
    </section>
  );
}

/** INBOX in the rail: how many have no time yet, and the first three. */
export function InboxCard({
  list,
  total,
  phase,
  onCheck,
  onOpen,
  onAll,
}: {
  list: readonly V3Task[];
  total: number;
  phase: Readonly<Record<string, string>>;
  onCheck: (t: V3Task) => void;
  onOpen: (id: string) => void;
  onAll: () => void;
}) {
  return (
    <section className="hd-inbox hd-panel">
      <header className="hd-inbox-head">
        <span className="hd-panel-title">Inbox</span>
        <span className="hd-meta-t hd-num">
          {total ? `${total} with no time yet` : "Clear"}
        </span>
        <button type="button" className="hd-link hd-push" onClick={onAll}>
          All
        </button>
      </header>
      {list.length ? (
        list.map((t) => (
          <Task
            key={t.id}
            layout="row"
            density="mini"
            task={t}
            className="hd-inbox-row hd-inbox-item"
            onToggle={() => onCheck(t)}
            onOpen={onOpen}
            style={{ opacity: phase[t.id] === "collapse" ? 0 : 1 }}
          />
        ))
      ) : (
        <p className="hd-inbox-none">
          Anything you jot down without a time lands here.
        </p>
      )}
      {total > list.length ? (
        <p className="hd-inbox-more">
          +{total - list.length} more — drag onto the day
        </p>
      ) : null}
    </section>
  );
}

/**
 * WEEK LOAD (rail, Week ahead). One row a day: planned against capacity as a
 * bar (grey up to capacity, red past it), the hours, and what is still free.
 * Red is always explained: the row's tooltip and the line under the list.
 */
export function WeekLoad({
  days,
  cap,
  pro,
  onCalendar,
  onUpgrade,
}: {
  days: readonly WeekDay[];
  cap: Capacity;
  pro: ProState;
  onCalendar: () => void;
  onUpgrade: () => void;
}) {
  const scale =
    Math.max(cap.min, ...days.map((d) => Math.max(d.cap, d.planned))) || 1;
  const over = days.filter((d) => d.cap && d.planned > d.cap);
  const planned = days.reduce((s, d) => s + d.planned, 0);
  const free = days.reduce((s, d) => s + Math.max(0, d.cap - d.planned), 0);
  return (
    <section className="hd-load hd-panel" data-hd-load="">
      <header className="hd-sched-head">
        <span className="hd-sched-heading">
          <span className="hd-panel-title hd-pro-title">
            Week load
            <Pill pro={pro} />
          </span>
          <span className="hd-meta-t hd-num">
            {pro
              ? `${hours(planned)} planned · ${hours(free)} free`
              : "Planned against your working hours, day by day"}
          </span>
        </span>
        {pro ? (
          <button
            type="button"
            className="hd-link hd-push"
            onClick={onCalendar}
          >
            Calendar
          </button>
        ) : null}
      </header>
      <div
        className={`hd-load-list${pro ? "" : " is-locked"}`}
        aria-hidden={pro ? undefined : "true"}
      >
        {days.map((d) => {
          const isOver = d.cap > 0 && d.planned > d.cap;
          const off = !d.cap;
          const inCap = Math.min(d.planned, d.cap || d.planned);
          const why = off
            ? `${d.short} · day off${d.planned ? ` · ${hours(d.planned)} planned anyway` : ""}`
            : `${d.short} · ${hours(d.planned)} planned of ${hours(d.cap)}${
                isOver
                  ? ` — ${hours(d.planned - d.cap)} more than your working hours`
                  : ` · ${hours(d.cap - d.planned)} free`
              }`;
          return (
            <div
              key={d.date}
              className={`hd-load-row${isOver ? " is-over" : ""}${off ? " is-off" : ""}`}
              title={why}
              aria-label={why}
              data-hd-load-day={d.d}
            >
              <span className="hd-load-day">
                <span className="hd-load-name">{d.short}</span>
                <span className="hd-load-date hd-num">{d.d}</span>
              </span>
              <span className="hd-load-bar">
                <span
                  className="hd-load-track"
                  style={{ width: `${off ? 0 : (d.cap / scale) * 100}%` }}
                />
                {inCap ? (
                  <span
                    className={`hd-load-fill${off ? " is-off" : ""}`}
                    style={{ width: `${(inCap / scale) * 100}%` }}
                  />
                ) : null}
                {isOver ? (
                  <span
                    className="hd-load-over"
                    style={{
                      left: `${(d.cap / scale) * 100}%`,
                      width: `${((d.planned - d.cap) / scale) * 100}%`,
                    }}
                  />
                ) : null}
                {!off ? (
                  <span
                    aria-hidden="true"
                    className="hd-load-cap"
                    style={{ left: `${(d.cap / scale) * 100}%` }}
                  />
                ) : null}
              </span>
              <span className="hd-load-nums">
                <span className="hd-load-planned hd-num">
                  {off && !d.planned ? "Day off" : hours(d.planned)}
                </span>
                <span
                  className={`hd-load-free hd-num${isOver ? " is-over" : ""}`}
                >
                  {off
                    ? d.planned
                      ? "day off"
                      : ""
                    : isOver
                      ? `+${hours(d.planned - d.cap)} over`
                      : `${hours(d.cap - d.planned)} free`}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      {pro === null ? null : !pro ? (
        <div className="hd-load-lock" data-hd-load-locked="">
          <span className="hd-load-lock-line">
            See which days are over capacity before they happen.
          </span>
          <button
            type="button"
            className="nx-btn nx-btn-secondary nx-btn-sm"
            onClick={onUpgrade}
          >
            <FiLock size={13} aria-hidden />
            Upgrade
          </button>
        </div>
      ) : (
        <p className="hd-load-note">
          {over.length ? (
            <>
              <span className="hd-load-note-over">
                {over.map((d) => d.short).join(", ")}{" "}
                {over.length === 1 ? "holds" : "hold"} more than your working
                hours ({cap.start}–{cap.end}).
              </span>{" "}
              Move something to a day with free time.
            </>
          ) : (
            `Every day fits inside your working hours (${cap.start}–${cap.end}).`
          )}
        </p>
      )}
    </section>
  );
}
