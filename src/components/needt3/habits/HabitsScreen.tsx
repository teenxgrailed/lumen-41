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
import { PlEmpty, StScreen } from "@/components/needt3/states/StScreen";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import {
  type Checkin,
  daysBetween,
  habitColor,
  habitDoneOn,
  liveHabits,
} from "@/lib/needt3/derive";
import {
  useArchiveHabit,
  useCheckins,
  useCreateHabit,
  useHabits,
  useToggleHabitToday,
  useUpdateHabit,
} from "@/lib/needt3/hooks/habits";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import type { V3Habit, V3Project } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

import strings from "../../../../docs/port/prototype/port/strings/en.json";
import {
  FREE_HABITS,
  PER_WEEK_CHOICES,
  capHabits,
  habitCard,
  habitGate,
  normTime,
  timeLeft,
  timeOk,
} from "./derive";

const hb = strings["Habits.jsx"];
const pl = strings["places.jsx"];

const undoToast = (msg: string, undo: () => Promise<void>) =>
  notify.success(msg, {
    action: { label: "Undo", onClick: () => void undo() },
  });

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

interface SheetForm {
  title: string;
  time: string;
  perWeek: number | null;
  projectId: string | null;
}

/** New / edit habit (places.jsx PlHabitSheet), drawn inside the v3 scope. */
function HabitSheet({
  habit,
  projects,
  onClose,
  onSave,
}: {
  habit: V3Habit | null;
  projects: readonly V3Project[];
  onClose: () => void;
  onSave: (f: {
    title: string;
    time: string | null;
    perWeek: number | null;
    projectId: string | null;
  }) => void;
}) {
  const [f, setF] = useState<SheetForm>(() =>
    habit
      ? {
          title: habit.title,
          time: habit.schedule.time ?? "",
          perWeek: habit.schedule.perWeek,
          projectId: habit.projectId,
        }
      : { title: "", time: "", perWeek: null, projectId: null }
  );
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
  const atOk = timeOk(f.time);
  const ok = !!f.title.trim() && atOk;
  const save = () => {
    if (!ok) return;
    onSave({
      title: f.title.trim(),
      time: normTime(f.time),
      perWeek: f.perWeek,
      projectId: f.projectId,
    });
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
            disabled={!ok}
            onClick={save}
          >
            {habit ? pl.PlHabitSheet.save : pl.PlHabitSheet.create_habit}
          </button>
        </div>
      </div>
    </div>
  );
}

export function HabitsScreen() {
  const tz = useTimeZone();
  const today = formatInTimeZone(newDate(), tz, "yyyy-MM-dd");
  const habits = useHabits();
  const checkinsQuery = useCheckins();
  const projectsQuery = useProjects();
  const plan = usePlan();
  const toggleToday = useToggleHabitToday();
  const createHabit = useCreateHabit();
  const updateHabit = useUpdateHabit();
  const archiveHabit = useArchiveHabit();
  const [sheet, setSheet] = useState<{ open: boolean; habit: V3Habit | null }>({
    open: false,
    habit: null,
  });
  const [all, setAll] = useState(false);

  const list = liveHabits(habits.data ?? []);
  const checkins = checkinsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  // The same limit the API enforces (POST /api/habits answers 403
  // UPGRADE_REQUIRED past it); this gate only saves the round trip.
  const gate = habitGate(plan.data?.kind, list.length);
  const kept = list.filter((h) => habitDoneOn(h.id, today, checkins)).length;
  const { over, shown } = capHabits(list, all);

  const openNew = () => {
    if (gate.atLimit) {
      notify.info(
        `Free keeps ${FREE_HABITS} habits. Upgrade to Pro for more.`,
        {
          action: {
            label: "See plans",
            onClick: () => window.location.assign("/settings#billing"),
          },
        }
      );
      return;
    }
    setSheet({ open: true, habit: null });
  };
  const closeSheet = () => setSheet((s) => ({ open: false, habit: s.habit }));

  const save = async (f: {
    title: string;
    time: string | null;
    perWeek: number | null;
    projectId: string | null;
  }) => {
    const habit = sheet.habit;
    closeSheet();
    const fields = {
      title: f.title,
      projectId: f.projectId,
      schedule: { time: f.time, perWeek: f.perWeek },
    };
    if (habit) {
      const { undo } = await updateHabit.mutateAsync({
        id: habit.id,
        patch: fields,
      });
      undoToast(pl.PlHabitSheet.habit_updated, undo);
    } else {
      const { undo } = await createHabit.mutateAsync({ draft: fields });
      undoToast(`Habit “${f.title}” added`, undo);
    }
  };

  const archive = async (h: V3Habit) => {
    await archiveHabit.mutateAsync({ id: h.id });
    //todo: Undo needs an un-archive write on /api/habits/[id].
    notify.success(`“${h.title}” archived`);
  };

  const meta =
    gate.max !== null
      ? `${gate.used} of ${gate.max} habits on Free`
      : `${list.length} ${list.length === 1 ? "habit" : "habits"} ${pl.HabitsScreen.nothing_carries_over}`;

  return (
    <div className="scroll-inner pl-habits-col" data-v3-screen="habits">
      <header className="pl-place-header-row">
        <button
          type="button"
          aria-label={pl.HabitsScreen.new_habit}
          title={pl.HabitsScreen.new_habit}
          data-page-add=""
          className="nx-btn nx-btn-secondary page-add"
          onClick={openNew}
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
                onClick={openNew}
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
                      onToggle={(x, done) =>
                        void toggleToday.mutateAsync({ id: x.id, done })
                      }
                      onRename={(x) => setSheet({ open: true, habit: x })}
                      onArchive={(x) => void archive(x)}
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
              {/* //todo: "Last four months" (HabitMonths + HabitRail) needs
                  HabitCompletion history past fourteen days; the API returns
                  only the 14-day strip, so it is not drawn yet. */}
              <div className="pl-habits-side">
                <section className="nx-swap pl-habits-left">
                  <HabitLeft tz={tz} />
                </section>
              </div>
            </div>
          </>
        )}
      </StScreen>
      {sheet.open ? (
        <HabitSheet
          habit={sheet.habit}
          projects={projects}
          onClose={closeSheet}
          onSave={(f) => void save(f)}
        />
      ) : null}
    </div>
  );
}
