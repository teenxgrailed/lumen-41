"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { LuArchive, LuCheck, LuPencil, LuPlus } from "react-icons/lu";

import { newDate } from "@/lib/date-utils";
import { type Checkin, habitColor } from "@/lib/needt3/derive";
import type { V3Habit, V3Project } from "@/lib/needt3/map";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import { PER_WEEK_CHOICES, timeLeft } from "../../habits/derive";
import {
  PkActions,
  type PkActs,
  PkButton,
  PkChips,
  PkEmpty,
  PkField,
  PkHold,
  PkNumber,
  PkRow,
  PkScreen,
  PkSection,
  PkSheet,
  pkCx,
  pkReduced,
} from "../kit";
import { PlaceState } from "../place-state/PlaceState";
import {
  type HabitForm,
  checkHabitForm,
  clockFacts,
  dayLine,
  historyDots,
  phoneHabitRow,
  searchHabits,
  streakFigure,
  streakLabel,
} from "./model";
import type { PhoneHabitsController } from "./usePhoneHabits";

const t = strings["phone-habits.jsx"];

const hueOf = (h: V3Habit, projects: readonly V3Project[]) =>
  habitColor(h, projects) || "var(--phb-none)";

/* ── Today: one check-in row, the ring in the habit's colour ── */
function HabitRow({
  h,
  hue,
  checkins,
  today,
  onTick,
  onHold,
}: {
  h: V3Habit;
  hue: string;
  checkins: readonly Checkin[];
  today: string;
  onTick: (h: V3Habit, done: boolean) => void;
  onHold: (h: V3Habit) => void;
}) {
  const row = phoneHabitRow(h, checkins, today);
  const toggle = () => onTick(h, !row.on);
  const ring = (
    <button
      type="button"
      className={pkCx("phb-ring", row.on && "is-on")}
      style={{ "--hue": hue } as CSSProperties}
      aria-pressed={row.on}
      aria-label={row.say}
      data-phb-ring={h.id}
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
    >
      <span className="phb-ring-in">
        {row.on ? <LuCheck size={14} aria-hidden /> : null}
      </span>
    </button>
  );
  return (
    <PkHold onHold={() => onHold(h)} data={{ "data-phb-hold": h.id }}>
      <div
        className={pkCx("phb-today", row.on && "is-on", row.rest && "is-rest")}
        data-phb-today={h.id}
      >
        <PkRow
          id={h.id}
          title={h.title}
          meta={row.meta}
          time={h.schedule.time}
          lead={ring}
          onOpen={toggle}
        />
      </div>
    </PkHold>
  );
}

/* ── The last fourteen days as dots; today is the one you can tap ── */
function HabitHistory({
  h,
  hue,
  checkins,
  today,
  onTick,
}: {
  h: V3Habit;
  hue: string;
  checkins: readonly Checkin[];
  today: string;
  onTick: (h: V3Habit, done: boolean) => void;
}) {
  const dots = historyDots(h.id, checkins, today);
  const kept = dots.filter((d) => d.kind === "on").length;
  const streak = streakFigure(h.id, checkins, today);
  return (
    <div
      className="phb-habit"
      data-phb-habit={h.id}
      style={{ "--hue": hue } as CSSProperties}
    >
      <div className="phb-habit-head">
        <span className="phb-habit-main">
          <span className="phb-habit-name">
            <span className="pk-hue" />
            {h.title}
          </span>
          <span className="phb-habit-cap">
            {kept} {t.PhbMonths.of_the_last} {dots.length} days
          </span>
        </span>
        <span className={pkCx("phb-streak", !streak.n && "is-none")}>
          <PkNumber
            value={streak.text}
            className="phb-streak-n"
            label={streakLabel(streak.n)}
          />
          <span className="phb-streak-cap">{t.PhbMonths.in_a_row}</span>
        </span>
      </div>
      <div
        className="phb-strip"
        role="group"
        aria-label={`${h.title} — the last ${dots.length} days`}
      >
        <span className="phb-month">
          <span className="phb-month-dots">
            {dots.map((d) =>
              d.today ? (
                <button
                  key={d.day}
                  type="button"
                  className={pkCx(
                    "phb-dot is-today",
                    d.kind === "on" && "is-on"
                  )}
                  aria-pressed={d.kind === "on"}
                  aria-label={`${t.PhbMonths.today} ${
                    d.kind === "on"
                      ? t.PhbMonths.kept_tap_to_undo
                      : t.PhbMonths.tap_to_mark_kept
                  }`}
                  onClick={() => onTick(h, d.kind !== "on")}
                />
              ) : (
                <span
                  key={d.day}
                  className={`phb-dot is-${d.kind}`}
                  title={d.label}
                />
              )
            )}
          </span>
        </span>
      </div>
    </div>
  );
}

/* ── Time left: hours today and days of the year as dots (not a score) ── */
function TimeLeft({ tz }: { tz: string }) {
  const [now, setNow] = useState(() => newDate());
  useEffect(() => {
    const id = window.setInterval(() => setNow(newDate()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const facts = clockFacts(now, tz);
  const left = timeLeft(facts);
  return (
    <div className="phb-left">
      <div className="phb-left-card">
        <div className="phb-left-dots is-hours" aria-hidden="true">
          {left.hours.map((k, i) => (
            <span key={i} className={`phb-ld is-${k}`} />
          ))}
        </div>
        <span className="phb-left-cap">
          <PkNumber value={left.hoursLeft} className="phb-left-n" />{" "}
          {left.hoursLeft === 1 ? "hour" : "hours"} {t.PhbLeft.left_today}
        </span>
      </div>
      <div className="phb-left-card">
        <div className="phb-left-dots is-year" aria-hidden="true">
          {left.days.map((k, i) => (
            <span key={i} className={`phb-ld is-${k}`} />
          ))}
        </div>
        <span className="phb-left-cap">
          <PkNumber value={left.daysLeft} className="phb-left-n" />{" "}
          {t.PhbLeft.days_left_in} {facts.year}
        </span>
      </div>
    </div>
  );
}

/* ── The new / edit sheet: the desktop's form (name, time, days, project) ── */
function HabitSheet({
  form,
  projects,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  form: HabitForm | null;
  projects: readonly V3Project[];
  saving: boolean;
  onChange: (p: Partial<HabitForm>) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  /* The last form stays drawn while the sheet slides away. */
  const last = useRef<HabitForm | null>(null);
  if (form) last.current = form;
  const f = form ?? last.current;
  const check = f ? checkHabitForm(f) : null;
  const editing = !!f?.editId;
  const title = editing ? t.PhbNewSheet.edit_habit : t.PhbNewSheet.new_habit;
  return (
    <PkSheet
      open={!!form}
      onClose={onClose}
      title={title}
      meta={t.PhbNewSheet.comes_back_every_day_a_missed_day_never_}
      label={title}
      className="phb-sheet"
      footer={
        <>
          <PkButton onClick={onClose}>{t.PhbNewSheet.cancel}</PkButton>
          <PkButton
            kind="primary"
            disabled={!check?.ok || saving}
            onClick={onSave}
            data-phb-create
          >
            {editing ? t.PhbNewSheet.save : t.PhbNewSheet.create_habit}
          </PkButton>
        </>
      }
    >
      {f ? (
        <div className="phb-form">
          <PkField
            label={t.PhbNewSheet.name}
            id="phb-name"
            value={f.title}
            onChange={(title) => onChange({ title })}
            placeholder={t.PhbNewSheet.habit_name}
            inputProps={{
              autoComplete: "off",
              enterKeyHint: "done",
              name: "habit-name",
              onKeyDown: (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSave();
                }
              },
            }}
          />
          <PkField
            label={t.PhbNewSheet.time_optional}
            id="phb-time"
            value={f.time}
            onChange={(time) => onChange({ time })}
            placeholder="HH:MM"
            className={pkCx("phb-time", !check?.timeOk && "is-invalid")}
            inputProps={{
              inputMode: "numeric",
              autoComplete: "off",
              enterKeyHint: "done",
              name: "habit-time",
              "aria-invalid": !check?.timeOk,
              "aria-describedby": check?.timeError ? "phb-time-err" : undefined,
              onKeyDown: (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSave();
                }
              },
            }}
          />
          {check?.timeError ? (
            <p id="phb-time-err" role="alert" className="phb-err">
              {check.timeError}
            </p>
          ) : null}
          <div className="phb-group">
            <span className="pk-label">{t.PhbNewSheet.days_per_week}</span>
            <div
              className="phb-seg"
              role="radiogroup"
              aria-label={t.PhbNewSheet.days_per_week}
            >
              {PER_WEEK_CHOICES.map(([q, n]) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={f.perWeek === q}
                  className={pkCx("phb-seg-btn", f.perWeek === q && "is-on")}
                  onClick={() => onChange({ perWeek: q })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="phb-group">
            <span className="pk-label">{t.PhbNewSheet.project_its_colour}</span>
            <PkChips className="phb-projs" label={t.PhbNewSheet.project}>
              {[null, ...projects.filter((p) => !p.archived)].map((p) => {
                const on = f.projectId === (p?.id ?? null);
                return (
                  <button
                    key={p?.id ?? "none"}
                    type="button"
                    className={pkCx("phb-proj", on && "is-on")}
                    aria-pressed={on}
                    onClick={() => onChange({ projectId: p?.id ?? null })}
                    style={
                      p?.color
                        ? ({ "--hue": p.color } as CSSProperties)
                        : undefined
                    }
                  >
                    <span className="phb-proj-dot" aria-hidden="true" />
                    {p ? p.name : t.PhbNewSheet.no_project}
                  </button>
                );
              })}
            </PkChips>
          </div>
        </div>
      ) : null}
    </PkSheet>
  );
}

/**
 * Habits (phone-habits.jsx PhbHabits). Today's check-ins first as calm rows
 * with a ring in the habit's colour; under them one strip per habit (the last
 * fourteen days, the streak as a rolling number), then Time left. A new
 * habit is made in a sheet. Pull down: search habits, Enter makes a new one.
 *
 * Free keeps FREE_HABITS: the count sits in the header and a new habit past
 * it opens the paywall sheet. State is the controller's
 * (`usePhoneHabits`, held above the face switch).
 *
 * //todo: hold-to-reorder and Move up / Down: habits have no order column or
 * route. //todo: "The last months": the API returns only the 14-day strip.
 * //todo: tick a past day: only /completions/today exists (data map §6).
 */
export function PhoneHabits({ ctl }: { ctl: PhoneHabitsController }) {
  const sc = useRef<HTMLElement | null>(null);
  const [acts, setActs] = useState<PkActs | null>(null);
  const { list, shown, checkins, projects, today, quota, kept } = ctl;

  const holdActs = (h: V3Habit) => {
    const row = phoneHabitRow(h, checkins, today);
    setActs({
      title: h.title,
      meta: [row.on ? t.PhbHabits.kept_today : t.PhbHabits.not_yet_today]
        .concat(h.schedule.time ? [h.schedule.time] : [])
        .join(" · "),
      actions: [
        {
          label: row.on ? t.PhbHabits.undo_today : t.PhbHabits.mark_kept_today,
          icon: <LuCheck size={18} aria-hidden />,
          hue: hueOf(h, projects),
          onClick: () => ctl.tick(h, !row.on),
          data: { "data-phb-act": "toggle" },
        },
        {
          label: t.PhbHabits.edit,
          hint: t.PhbHabits.name_time_days_project,
          icon: <LuPencil size={18} aria-hidden />,
          hue: "var(--v2p-lav)",
          onClick: () => ctl.openEdit(h),
          data: { "data-phb-act": "edit" },
        },
        {
          label: t.PhbHabits.archive,
          hint: t.PhbHabits.its_days_stay_it_stops_coming_back,
          icon: <LuArchive size={18} aria-hidden />,
          danger: true,
          onClick: () => void ctl.archive(h),
          data: { "data-phb-act": "archive" },
        },
      ],
    });
  };

  const pull = {
    search: (q: string) =>
      searchHabits(list, q).map((h) => ({
        id: h.id,
        title: h.title,
        meta: phoneHabitRow(h, checkins, today).meta.split(" · ")[0],
      })),
    onPick: (hit: { id: string }) => {
      const el = sc.current?.querySelector(`[data-phb-habit="${hit.id}"]`);
      el?.scrollIntoView({
        block: "center",
        behavior: pkReduced() ? "auto" : "smooth",
      });
    },
    onAdd: (q: string) => {
      if (q.trim()) void ctl.create(q);
      else ctl.openNew();
    },
    placeholder: t.PhbHabits.search_or_add_a_habit,
    hint: t.PhbHabits.habits_by_name_enter_makes_a_new_one,
    addLabel: (q: string) => (q ? `New habit “${q}”` : t.PhbHabits.new_habit),
  };

  const head: ReactNode =
    list.length || quota.text ? (
      <div
        className="phb-head"
        data-phb-kept={list.length ? `${kept}/${list.length}` : undefined}
      >
        {list.length ? (
          <>
            <span className="phb-head-text">
              <PkNumber
                value={kept}
                className="phb-head-n"
                label={`${kept} of ${list.length} ${t.PhbHabits.kept_today_2}`}
              />{" "}
              of {list.length} {t.PhbHabits.kept_today_2}
            </span>
            <span className="phb-bar" aria-hidden="true">
              <span
                className="phb-bar-fill"
                style={
                  { "--p": (kept / list.length).toFixed(3) } as CSSProperties
                }
              />
            </span>
          </>
        ) : null}
        {quota.text ? (
          <span className="phb-head-text" data-phb-quota={quota.text}>
            {quota.text}
            {quota.full ? (
              <>
                {" · "}
                <PkButton
                  kind="inline"
                  onClick={ctl.openUpgrade}
                  data-phb-upgrade
                >
                  Upgrade for more
                </PkButton>
              </>
            ) : null}
          </span>
        ) : null}
      </div>
    ) : null;

  return (
    <>
      <PkScreen
        screen="habits"
        title={t.PhbHabits.habits}
        glyph="habits"
        sub={dayLine(today)}
        head={head}
        right={
          <PkButton
            kind="chip"
            icon={<LuPlus size={16} aria-hidden />}
            onClick={ctl.openNew}
            aria-label={t.PhbHabits.new_habit}
            data-phb-new
          >
            {t.PhbHabits.new}
          </PkButton>
        }
        onPull={pull}
        scrollRef={(el) => {
          sc.current = el;
        }}
        className="phb-screen"
      >
        <PlaceState query={ctl.habits} screen="habits">
          {!list.length ? (
            <PkEmpty
              title={t.PhbHabits.no_habits_yet}
              line={t.PhbHabits.a_habit_comes_back_every_day_a_missed_da}
              action={
                <PkButton
                  kind="primary"
                  icon={<LuPlus size={16} aria-hidden />}
                  onClick={ctl.openNew}
                >
                  {t.PhbHabits.new_habit}
                </PkButton>
              }
            />
          ) : (
            <>
              <PkSection
                title={t.PhbHabits.today}
                count={kept === list.length ? t.PhbHabits.all_kept : undefined}
                className="phb-sec"
              >
                {shown.map((h) => (
                  <HabitRow
                    key={h.id}
                    h={h}
                    hue={hueOf(h, projects)}
                    checkins={checkins}
                    today={today}
                    onTick={ctl.tick}
                    onHold={holdActs}
                  />
                ))}
              </PkSection>
              {ctl.over ? (
                <PkButton
                  kind="ghost"
                  className="phb-more"
                  onClick={() => ctl.setAll(!ctl.all)}
                >
                  {ctl.all
                    ? t.PhbHabits.show_fewer
                    : `${t.PhbHabits.show_all} ${list.length}`}
                </PkButton>
              ) : null}

              <PkSection title="The last 14 days" className="phb-sec is-months">
                {list.map((h) => (
                  <HabitHistory
                    key={h.id}
                    h={h}
                    hue={hueOf(h, projects)}
                    checkins={checkins}
                    today={today}
                    onTick={ctl.tick}
                  />
                ))}
              </PkSection>

              <PkSection
                title={t.PhbHabits.time_left}
                className="phb-sec is-left"
              >
                <TimeLeft tz={ctl.tz} />
              </PkSection>
              <p className="phb-foot">
                {t.PhbHabits.a_missed_day_stays_empty_nothing_carries}
              </p>
            </>
          )}
        </PlaceState>
      </PkScreen>
      <HabitSheet
        form={ctl.form}
        projects={projects}
        saving={ctl.saving}
        onChange={ctl.patchForm}
        onClose={ctl.closeForm}
        onSave={() => void ctl.save()}
      />
      <PkActions acts={acts} onClose={() => setActs(null)} />
    </>
  );
}
