"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

import {
  FiArchive,
  FiCheck,
  FiEdit2,
  FiFolder,
  FiMoreHorizontal,
  FiPlus,
  FiRepeat,
} from "react-icons/fi";

import { PopMenu } from "@/components/needt3/mail/PopMenu";
import { ProLimit, useIsPro } from "@/components/needt3/paywall/Pro";
import { PlEmpty, StScreen } from "@/components/needt3/states/StScreen";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { type Checkin, daysBetween, habitColor } from "@/lib/needt3/derive";
import { useCheckinHistory } from "@/lib/needt3/hooks/habits";
import type { V3Habit, V3Project } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

import strings from "../../../../docs/port/prototype/port/strings/en.json";
import { type HabitForm, checkHabitForm } from "../phone/habits/model";
import {
  FREE_HABITS,
  MONTH_LONG,
  MONTH_SHORT,
  PER_WEEK_CHOICES,
  activeDays,
  habitCard,
  monthRows,
  timeLeft,
} from "./derive";
import type { HabitsController } from "./useHabitsController";

const hb = strings["Habits.jsx"];
const pl = strings["places.jsx"];

/* The strip: fourteen cells, the last is today and the only control. */
function HabitStrip({
  done,
  hue,
  onToggle,
}: {
  done: (0 | 1)[];
  hue: string;
  onToggle: () => void;
}) {
  return (
    <span className="hb-strip">
      {done.map((d, i) => {
        const today = i === done.length - 1;
        return (
          <span
            key={i}
            role={today ? "checkbox" : undefined}
            aria-checked={today ? !!d : undefined}
            aria-label={today ? hb.HabitStrip.done_today : undefined}
            title={today ? hb.HabitStrip.today : undefined}
            onClick={
              today
                ? (e) => {
                    e.stopPropagation();
                    onToggle();
                  }
                : undefined
            }
            className={`hb-cell${today ? " is-today" : ""}${d ? " is-on" : ""}`}
            style={
              d
                ? { background: hue }
                : today
                  ? { boxShadow: `inset 0 0 0 1px ${hue}` }
                  : undefined
            }
          />
        );
      })}
    </span>
  );
}

function HabitTodayCard({
  h,
  i,
  hue,
  checkins,
  today,
  onToggle,
  onRename,
  onArchive,
}: {
  h: V3Habit;
  i: number;
  hue: string;
  checkins: readonly Checkin[];
  today: string;
  onToggle: (h: V3Habit, done: boolean) => void;
  onRename: (h: V3Habit) => void;
  onArchive: (h: V3Habit) => void;
}) {
  const c = habitCard(h, checkins, today);
  const toggle = () => onToggle(h, !c.on);
  return (
    <div
      role="checkbox"
      aria-checked={c.on}
      tabIndex={0}
      aria-label={c.say}
      title={c.say}
      data-hb-today={h.id}
      className={`hb-today-card nx-swap nx-press nx-focus${c.on ? " is-on" : ""}${c.rest ? " is-rest" : ""}`}
      style={
        { animationDelay: `${i * 30}ms`, "--hb-hue": hue } as CSSProperties
      }
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <span className="hb-today-top">
        <span aria-hidden className="hb-today-check">
          {c.on ? <FiCheck size={16} /> : null}
        </span>
        {h.schedule.time ? (
          <span className="hb-today-time">{h.schedule.time}</span>
        ) : null}
        <span className="hb-today-menu">
          <PopMenu
            label={`${pl.PlHabitMenu.more_for} ${h.title}`}
            align="right"
            width={200}
            trigger={() => (
              <button
                type="button"
                aria-label={`${pl.PlHabitMenu.more_for} ${h.title}`}
                className="nx-press pl-habit-more pl-habit-menu-grid"
              >
                <FiMoreHorizontal size={14} aria-hidden />
              </button>
            )}
            items={[
              {
                key: "rename",
                title: pl.PlHabitMenu.rename,
                icon: <FiEdit2 size={16} />,
                onSelect: () => onRename(h),
              },
              {
                key: "archive",
                title: pl.PlHabitMenu.archive,
                icon: <FiArchive size={16} />,
                onSelect: () => onArchive(h),
              },
            ]}
          />
        </span>
      </span>
      <span className="hb-today-title">{h.title}</span>
      <span className="hb-today-meta">
        <span className="hb-today-label">{c.status}</span>
        <span className="hb-today-sep" aria-hidden>
          ·
        </span>
        <span className="hb-today-label">{c.label}</span>
      </span>
      <HabitStrip done={c.days} hue={hue} onToggle={toggle} />
    </div>
  );
}

/**
 * Last four months (Habits.jsx HabitRail + HabitMonths): a dot a day, filled
 * where any shown habit was kept, grey where none was, a ring while the day is
 * still ahead. "All" or one habit; today's dot ticks (all, or the one picked).
 */
function HabitMonths({
  list,
  projects,
  checkins,
  today,
  onTick,
}: {
  list: readonly V3Habit[];
  projects: readonly V3Project[];
  checkins: readonly Checkin[];
  today: string;
  onTick: (h: V3Habit, done: boolean) => void;
}) {
  const [pickId, setPickId] = useState<string | null>(null);
  const picked = list.find((h) => h.id === pickId) ?? null;
  const shown = picked ? [picked] : list;
  const hue = picked ? habitColor(picked, projects) || "var(--accent)" : null;
  const rows = monthRows(
    today,
    shown.map((h) => h.id),
    checkins
  );
  const active = activeDays(rows);
  const keptToday = (h: V3Habit) =>
    checkins.some((c) => c.habitId === h.id && c.date === today && c.done);
  const tickToday = () => {
    if (picked) return onTick(picked, !keptToday(picked));
    const allOn = list.length > 0 && list.every(keptToday);
    list.forEach((h) => onTick(h, !allOn));
  };
  const curMonth = rows.find((r) => r.current)?.month ?? 0;
  return (
    <div className="hb-rail">
      <div className="hb-picks" role="tablist" aria-label={hb.HabitRail.show}>
        <button
          type="button"
          role="tab"
          aria-selected={!picked}
          className={`hb-pick${!picked ? " is-on" : ""}`}
          onClick={() => setPickId(null)}
        >
          {hb.HabitRail.all}
        </button>
        {list.map((h) => (
          <button
            key={h.id}
            type="button"
            role="tab"
            aria-selected={picked?.id === h.id}
            className={`hb-pick${picked?.id === h.id ? " is-on" : ""}`}
            onClick={() => setPickId(h.id)}
          >
            <span
              className="hb-pick-dot"
              style={{ background: habitColor(h, projects) || "var(--accent)" }}
            />
            {h.title}
          </button>
        ))}
      </div>
      <div className="hb-months" data-hb-months="">
        {rows.map((r) => (
          <div
            key={r.key}
            className={`hb-month${r.current ? " is-current" : ""}`}
          >
            <span className="hb-month-name">
              {MONTH_SHORT[r.month].toUpperCase()}
            </span>
            <div className="hb-month-dots">
              {r.dots.map((d) => {
                const label = `${d.day} ${MONTH_SHORT[r.month]}${
                  d.kind === "ahead"
                    ? " · ahead"
                    : ` · ${d.kept} of ${shown.length} kept`
                }`;
                const fill =
                  d.kind === "on"
                    ? hue ||
                      (d.ratio >= 1
                        ? "var(--accent)"
                        : `color-mix(in oklab, var(--accent) ${Math.round(35 + d.ratio * 55)}%, transparent)`)
                    : null;
                return (
                  <span
                    key={d.day}
                    title={label}
                    aria-label={label}
                    onClick={d.today ? tickToday : undefined}
                    className={`hb-dot is-${d.kind}${d.today ? " is-today" : ""}`}
                    style={fill ? { background: fill } : undefined}
                  />
                );
              })}
            </div>
          </div>
        ))}
        <span className="hb-months-sum">
          <b className="font-display">{active}</b>{" "}
          {active === 1 ? "active day" : "active days"} in{" "}
          {MONTH_LONG[curMonth]}
        </span>
      </div>
    </div>
  );
}

/* Time left: hours left today and days left in the year, from the person's clock. */
function HabitLeft({ tz }: { tz: string }) {
  const [now, setNow] = useState(() => newDate());
  useEffect(() => {
    const t = window.setInterval(() => setNow(newDate()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const day = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const year = Number(day.slice(0, 4));
  const left = timeLeft({
    year,
    dayOfYear: daysBetween(`${year}-01-01`, day),
    hour: Number(formatInTimeZone(now, tz, "H")),
    minute: Number(formatInTimeZone(now, tz, "m")),
  });
  return (
    <div className="hb-left-wrap">
      <div className="hb-left">
        <div className="hb-left-card">
          <div className="hb-left-dots is-hours">
            {left.hours.map((k, i) => (
              <span key={i} className={`hb-ldot is-${k}`} />
            ))}
          </div>
          <span className="hb-left-cap">
            <span>
              <b className="font-display">{left.hoursLeft}</b>{" "}
              {left.hoursLeft === 1 ? "hour" : "hours"}{" "}
              {hb.HabitLeft.left_today}
            </span>
          </span>
        </div>
        <div className="hb-left-card">
          <div className="hb-left-dots is-year">
            {left.days.map((k, i) => (
              <span key={i} className={`hb-ldot is-${k}`} />
            ))}
          </div>
          <span className="hb-left-cap">
            <span>{year}</span>
            <span>
              <b className="font-display">{left.daysLeft}</b>{" "}
              {hb.HabitLeft.days_left}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** New / edit habit (places.jsx PlHabitSheet), drawn inside the v3 scope. The form is the controller's. */
function HabitSheet({
  form,
  projects,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  form: HabitForm;
  projects: readonly V3Project[];
  saving: boolean;
  onChange: (p: Partial<HabitForm>) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const f = form;
  const setF = (next: HabitForm) => onChange(next);
  const habit = f.editId ? f : null;
  const nameRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);
  const { ok, timeOk: atOk } = checkHabitForm(f);
  const save = () => {
    if (!ok || saving) return;
    onSave();
  };
  const sheetTitle = habit
    ? pl.PlHabitSheet.edit_habit
    : pl.PlHabitSheet.new_habit;
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
        aria-label={sheetTitle}
        className="nx-sheet pl-habit-sheet pl-habit-sheet-col"
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            (e.target as HTMLElement).tagName === "INPUT"
          )
            save();
        }}
      >
        <div className="pl-row-12">
          <FiRepeat size={28} aria-hidden />
          {/* //todo: the place picture is <Art name="habit"> (T05). */}
          <span className="pl-habit-sheet-col-2">
            <span className="pl-sheet-title">{sheetTitle}</span>
            <span className="pl-meta">
              {pl.PlHabitSheet.comes_back_daily_never_piles_up}
            </span>
          </span>
        </div>
        <label className="pl-stack-6">
          <span className="pl-label">{pl.PlHabitSheet.name}</span>
          <input
            ref={nameRef}
            name="habit-name"
            value={f.title}
            placeholder={pl.PlHabitSheet.new_habit}
            onChange={(e) => setF({ ...f, title: e.target.value })}
            className="pl-field"
          />
        </label>
        <label className="pl-stack-6">
          <span className="pl-label">
            {pl.PlHabitSheet.time}{" "}
            <span className="pl-habit-sheet-text-3">
              {pl.PlHabitSheet.optional}
            </span>
          </span>
          <input
            name="habit-time"
            value={f.time}
            placeholder="HH:MM"
            inputMode="numeric"
            aria-invalid={!atOk}
            onChange={(e) => setF({ ...f, time: e.target.value })}
            className={`pl-field is-time is-num${atOk ? "" : " is-invalid"}`}
          />
        </label>
        <div className="pl-stack-6">
          <span className="pl-label">{pl.PlHabitSheet.days_per_week}</span>
          <span className="pl-habit-sheet-row-2">
            {PER_WEEK_CHOICES.map(([q, n]) => (
              <button
                key={n}
                type="button"
                className="pl-seg pl-seg-btn"
                aria-pressed={f.perWeek === q}
                onClick={() => setF({ ...f, perWeek: q })}
              >
                {n}
              </button>
            ))}
          </span>
        </div>
        <div className="pl-stack-6">
          <span className="pl-label">
            {pl.PlHabitSheet.project}{" "}
            <span className="pl-habit-sheet-text-3">
              {pl.PlHabitSheet.optional}
            </span>
          </span>
          <span className="pl-habit-sheet-row-3">
            {[null, ...projects.filter((p) => !p.archived)].map((p) => {
              const on = f.projectId === (p?.id ?? null);
              return (
                <button
                  key={p?.id ?? "none"}
                  type="button"
                  className={`pl-chip pl-habit-sheet-row-4${on ? " is-on" : ""}`}
                  aria-pressed={on}
                  onClick={() => setF({ ...f, projectId: p?.id ?? null })}
                >
                  <span
                    className="pl-habit-sheet-row-5"
                    style={
                      p?.color
                        ? ({ "--pl-project": p.color } as CSSProperties)
                        : undefined
                    }
                  >
                    <FiFolder size={12} aria-hidden />
                  </span>
                  {p ? p.name : pl.PlHabitSheet.no_project}
                </button>
              );
            })}
          </span>
        </div>
        <div className="pl-habit-sheet-row-6">
          <button
            type="button"
            className="nx-btn nx-btn-text"
            onClick={onClose}
          >
            {pl.PlHabitSheet.cancel}
          </button>
          <button
            type="button"
            className="nx-btn nx-btn-primary pl-habit-save"
            disabled={!ok || saving}
            onClick={save}
          >
            {habit ? pl.PlHabitSheet.save : pl.PlHabitSheet.create_habit}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The desktop's notice when a new habit is refused by the Free allowance. */
export function notifyHabitsBlocked() {
  notify.info(`Free keeps ${FREE_HABITS} habits. Upgrade to Pro for more.`, {
    action: {
      label: "See plans",
      onClick: () => window.location.assign("/settings#billing"),
    },
  });
}

/** The desktop's archive notice (the phone words it its own way). */
export const archivedNotice = (title: string) => `“${title}” archived`;

/**
 * Habits, desktop face. What it holds (the sheet and its draft, "show all",
 * the writes) is `ctl`, created once by the route above the phone / desktop
 * switch (`useHabitsController`).
 */
export function HabitsScreen({ ctl }: { ctl: HabitsController }) {
  const { habits, list, shown, over, all, setAll, checkins, projects, today } =
    ctl;
  const kept = ctl.kept;

  const pro = useIsPro();
  const history = useCheckinHistory();
  // Free reads "3 of 3 habits · Upgrade for more" (4 habits · Free includes 3
  // once over); Pro reads the count and what the screen promises.
  const meta = !pro ? (
    <ProLimit
      used={list.length}
      max={FREE_HABITS}
      noun="habits"
      feature={`${pl.HabitsScreen.more_than} ${FREE_HABITS} habits`}
    />
  ) : (
    `${list.length} ${list.length === 1 ? "habit" : "habits"} ${pl.HabitsScreen.nothing_carries_over}`
  );

  return (
    <div className="scroll-inner pl-habits-col" data-v3-screen="habits">
      <header className="pl-place-header-row">
        <button
          type="button"
          aria-label={pl.HabitsScreen.new_habit}
          title={pl.HabitsScreen.new_habit}
          data-page-add=""
          className="nx-btn nx-btn-secondary page-add"
          onClick={ctl.openNew}
        >
          <FiPlus size={18} aria-hidden />
        </button>
        <h1 className="pl-place-header-text">{pl.HabitsScreen.habits}</h1>
        <span className="pl-place-header-text-2">{meta}</span>
      </header>
      <StScreen query={habits} screen="habits">
        {!list.length ? (
          <PlEmpty
            art={<FiRepeat size={40} aria-hidden />}
            title={pl.HabitsScreen.no_habits_yet}
            line={pl.HabitsScreen.pick_one_small_thing_to_do_every_day_it_}
            action={
              <button
                type="button"
                className="nx-btn nx-btn-primary"
                onClick={ctl.openNew}
              >
                <FiPlus size={14} aria-hidden />
                {pl.HabitsScreen.new_habit}
              </button>
            }
          />
        ) : (
          <>
            <section className="nx-swap pl-habits-today">
              <div className="hb-today">
                <div className="hb-today-head">
                  <span className="hb-today-heading">
                    {hb.HabitToday.today}
                  </span>
                  <span className="hb-today-count">
                    {kept} of {list.length} kept
                  </span>
                  {/* //todo: the "n days closed" chip needs ClosedDay rows,
                      which nothing writes yet (01-data-map §4). */}
                </div>
                <div className="hb-today-grid">
                  {shown.map((h, i) => (
                    <HabitTodayCard
                      key={h.id}
                      h={h}
                      i={i}
                      hue={habitColor(h, projects) || "var(--text-tertiary)"}
                      checkins={checkins}
                      today={today}
                      onToggle={ctl.tick}
                      onRename={ctl.openEdit}
                      onArchive={(x) => void ctl.archive(x)}
                    />
                  ))}
                </div>
                {over ? (
                  <button
                    type="button"
                    className="nx-btn nx-btn-text nx-btn-sm hb-today-more"
                    data-hb-more={all ? "less" : "all"}
                    onClick={() => setAll(!all)}
                  >
                    {all
                      ? hb.HabitToday.show_fewer
                      : `${hb.HabitToday.show_all} ${list.length}`}
                  </button>
                ) : null}
                <p className="hb-today-foot">
                  {hb.HabitToday.a_missed_day_stays_empty_nothing_carries}
                </p>
              </div>
            </section>
            <div className="pl-habits-grid">
              <section className="nx-swap pl-habits-col-2">
                <span className="pl-sheet-title">
                  {pl.HabitsScreen.last_four_months}
                </span>
                <span className="pl-habits-text">
                  {pl.HabitsScreen.one_dot_a_day_coloured_kept_grey_missed_}
                </span>
                <HabitMonths
                  list={list}
                  projects={projects}
                  // The long read; until it arrives (or if it fails) the cards'
                  // own fourteen days, so the current month is never blank.
                  checkins={history.data ?? checkins}
                  today={today}
                  onTick={ctl.tick}
                />
              </section>
              <div className="pl-habits-side">
                <section className="nx-swap pl-habits-left">
                  <HabitLeft tz={ctl.tz} />
                </section>
              </div>
            </div>
          </>
        )}
      </StScreen>
      {ctl.form ? (
        <HabitSheet
          form={ctl.form}
          projects={projects}
          saving={ctl.saving}
          onChange={ctl.patchForm}
          onClose={ctl.closeForm}
          onSave={() => void ctl.save()}
        />
      ) : null}
    </div>
  );
}
