"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { FiChevronLeft, FiChevronRight, FiEye, FiEyeOff } from "react-icons/fi";
import { LuPlus } from "react-icons/lu";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { addDays, addMinutes, hhmm, hourOf, stamp } from "@/lib/needt3/derive";
import {
  useCalendars,
  useCreateEvent,
  useEventLifecycle,
  useEvents,
  useUpdateEvent,
} from "@/lib/needt3/hooks/events";
import { useProjects } from "@/lib/needt3/hooks/projects";
import {
  useSetPref,
  useSettings,
  useTimeZone,
} from "@/lib/needt3/hooks/settings";
import { useTasks, useToggleTask } from "@/lib/needt3/hooks/tasks";
import { notify } from "@/lib/notifications";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { V3DragProvider, useV3Drag } from "../drag/DragHost";
import { RichMenu } from "../menu/RichMenu";
import { PhoneCalendar } from "../phone/calendar/PhoneCalendar";
import { useDesignV3 } from "../root/V3Root";
import { usePhoneUi } from "../root/phone-ui-context";
import { StScreen } from "../states/StScreen";
import { AGENDA_SIZES, type AgendaSize, DaysView } from "./DaysView";
import { Seg2 } from "./Seg2";
import { type Draft, WeekView } from "./WeekView";
import {
  type CalItem,
  calendarItems,
  canEditEvent,
  hideDoneTitle,
} from "./blocks";
import { daySpan, freeSlot, hourBounds, spanLabel, weekStart } from "./layout";

type View = "week" | "days";
/** Under this width the week grid shows three days (tablet, 07.10.26). */
const NARROW_QUERY = "(max-width: 899px)";

function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    setNarrow(mq.matches);
    const read = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return narrow;
}

/** The person's day and the clock's decimal hour, re-read once a minute. */
function useClock(tz: string) {
  const read = useCallback(() => {
    const stamp = formatInTimeZone(newDate(), tz, "yyyy-MM-dd'T'HH:mm");
    return { today: stamp.slice(0, 10), hour: hourOf(stamp) ?? 0 };
  }, [tz]);
  const [clock, setClock] = useState(read);
  useEffect(() => {
    setClock(read());
    const id = window.setInterval(() => setClock(read()), 60_000);
    return () => window.clearInterval(id);
  }, [read]);
  return clock;
}

const quote = (s: string) => `“${s}”`;

/** CALENDAR ($P/calendar2.jsx `CalendarCraft`): Week (3 days when narrow) and Agenda. */
export function CalendarCraft() {
  const v3 = useDesignV3();
  const host = useV3Drag();
  const phone = usePhoneUi() === "phone";
  if (!v3) return null;
  // the phone's own face (phone/calendar); the desktop face below is untouched
  if (phone) return <PhoneCalendar />;
  // the shell's drag host when it has one; until then the calendar's own
  return host ? (
    <CalendarScreen />
  ) : (
    <V3DragProvider>
      <CalendarScreen />
    </V3DragProvider>
  );
}

function CalendarScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const tz = useTimeZone();
  const { today, hour } = useClock(tz);
  const narrow = useNarrow();
  const settings = useSettings();
  const setPref = useSetPref();
  const prefs = settings.data?.prefs ?? {};
  const weekStartDay = settings.data?.weekStartDay ?? "monday";
  const drag = useV3Drag();
  const setComposerOpen = useNeedt3Ui((s) => s.setComposerOpen);

  /* View, Hide done and the Agenda size are remembered in UserSettings
     (prefs `view`, `calHideDone`, `calDays`); local state answers at once. */
  const [viewLocal, setViewLocal] = useState<View | null>(null);
  const [hideLocal, setHideLocal] = useState<boolean | null>(null);
  const [nLocal, setNLocal] = useState<AgendaSize | null>(null);
  const view: View = viewLocal ?? (prefs.view === "days" ? "days" : "week");
  const hideDone = hideLocal ?? prefs.calHideDone === true;
  const n: AgendaSize =
    nLocal ??
    (AGENDA_SIZES.includes(prefs.calDays as AgendaSize)
      ? (prefs.calDays as AgendaSize)
      : 3);
  const save = (key: string, value: unknown) =>
    void setPref(key, value).catch(() => undefined);
  const setView = (v: View) => {
    setViewLocal(v);
    save("view", v);
  };
  const setHideDone = (v: boolean) => {
    setHideLocal(v);
    save("calHideDone", v);
  };
  const setN = (k: AgendaSize) => {
    setNLocal(k);
    save("calDays", k);
  };

  /* What is on screen: a week (or three days from a day when narrow) and the
     Agenda's own span, both paged. */
  const [weekFrom, setWeekFrom] = useState<string | null>(null);
  const [narrowFrom, setNarrowFrom] = useState<string | null>(null);
  const [agendaFrom, setAgendaFrom] = useState<string | null>(null);
  const thisWeek = weekStart(today, weekStartDay);
  const weekDays = narrow
    ? daySpan(narrowFrom ?? today, 3)
    : daySpan(weekFrom ?? thisWeek, 7);
  const agendaDays = daySpan(agendaFrom ?? today, n);
  const days = view === "week" ? weekDays : agendaDays;
  const range = {
    from: days[0].date,
    to: addDays(days[days.length - 1].date, 1),
  };

  const tasksQuery = useTasks();
  const eventsQuery = useEvents(range);
  const projects = useProjects().data;
  const calendars = useCalendars().data;
  const calendarNames = useMemo(
    () => new Map((calendars ?? []).map((c) => [c.id, c.name])),
    [calendars]
  );
  const ownCalendarIds = useMemo(
    () => new Set((calendars ?? []).map((c) => c.id)),
    [calendars]
  );
  const { timed, loose, doneHidden } = useMemo(
    () =>
      calendarItems({
        tasks: tasksQuery.data ?? [],
        events: eventsQuery.data ?? [],
        projects,
        calendarNames,
        ownCalendarIds,
        today,
        hideDone,
      }),
    [
      tasksQuery.data,
      eventsQuery.data,
      projects,
      calendarNames,
      ownCalendarIds,
      today,
      hideDone,
    ]
  );
  const shownDays = new Set(days.map((d) => d.date));
  const visible = timed.filter((b) => shownDays.has(b.date));
  const bounds = hourBounds(visible);

  const toggle = useToggleTask();
  const updateEvent = useUpdateEvent();
  const lifecycle = useEventLifecycle();
  const createEvent = useCreateEvent();
  const [draft, setDraft] = useState<Draft | null>(null);

  const undoable = (message: string, undo: () => Promise<void>) =>
    notify.success(message, {
      action: { label: "Undo", onClick: () => void undo() },
    });
  const ignore = () => undefined;

  const onOpen = useCallback(
    (id: string) => router.push(`/tasks?task=${encodeURIComponent(id)}`),
    [router]
  );
  const onDone = (b: CalItem) => {
    const was = !!b.done;
    void toggle
      .toggle({ id: b.id, done: was })
      .then(({ undo }) =>
        undoable(
          was ? `Reopened ${quote(b.title)}` : `Done · ${quote(b.title)}`,
          undo
        )
      )
      .catch(ignore);
  };
  const onRename = (b: CalItem, title: string) => {
    //todo: PATCH /api/events/[id] writes the local copy only; until it writes
    // back to the provider, synced events are read-only here (canEditEvent).
    if (!canEditEvent(b)) return;
    void updateEvent
      .mutateAsync({ id: b.id, patch: { title } })
      .then(({ undo }) => undoable(`Renamed to ${quote(title)}`, undo))
      .catch(ignore);
  };
  const onDelete = (b: CalItem) => {
    if (!b.event || !canEditEvent(b)) return;
    void lifecycle
      .mutateAsync({ remove: b.id })
      .then(({ undo }) => undoable(`Deleted ${quote(b.title)}`, undo))
      .catch(ignore);
  };
  const onSlot = (date: string, at: number) =>
    setDraft({ date, at, key: newDate().getTime() });
  const onSave = (title: string) => {
    const d = draft;
    setDraft(null);
    if (!d) return;
    const startAt = stamp(d.date, d.at) ?? `${d.date}T09:00`;
    const endAt = addMinutes(startAt, 60) ?? startAt;
    // always a Needt (LOCAL) calendar, created once if missing — never a
    // synced provider calendar
    void createEvent({ title, startAt, endAt, isAllDay: false })
      .then(({ undo }) =>
        undoable(`Added ${quote(title)} · ${hhmm(d.at)}`, undo)
      )
      .catch(ignore);
  };
  const newEvent = useCallback(() => {
    setViewLocal("week");
    setWeekFrom(null);
    setNarrowFrom(null);
    setDraft({
      date: today,
      at: freeSlot(timed, today, hour, bounds.end),
      key: newDate().getTime(),
    });
  }, [today, timed, hour, bounds.end]);

  /* Create → New event arrives as /calendar?new=event (the shell's link). */
  const wantsNew = params?.get("new") === "event";
  useEffect(() => {
    if (!wantsNew || tasksQuery.data === undefined) return;
    newEvent();
    router.replace("/calendar");
  }, [wantsNew, tasksQuery.data, newEvent, router]);

  const page = (dir: -1 | 1) => {
    if (view === "days") {
      setAgendaFrom(addDays(agendaDays[0].date, dir * n));
      return;
    }
    if (narrow) setNarrowFrom(addDays(weekDays[0].date, dir * 3));
    else setWeekFrom(addDays(weekDays[0].date, dir * 7));
  };
  const goToday = () => {
    setWeekFrom(null);
    setNarrowFrom(null);
    setAgendaFrom(null);
  };

  const carried = drag?.drag
    ? (tasksQuery.data ?? []).find((t) => t.id === drag.drag?.item.id)
    : null;
  const carryAt = carried ? hourOf(carried.scheduledStart) : null;

  const combined = {
    status:
      tasksQuery.status === "error" || eventsQuery.status === "error"
        ? ("error" as const)
        : tasksQuery.status === "pending" || eventsQuery.status === "pending"
          ? ("pending" as const)
          : ("success" as const),
    fetchStatus:
      tasksQuery.fetchStatus === "paused" ||
      eventsQuery.fetchStatus === "paused"
        ? ("paused" as const)
        : tasksQuery.fetchStatus,
    data:
      tasksQuery.data !== undefined && eventsQuery.data !== undefined
        ? true
        : undefined,
    error: tasksQuery.error ?? eventsQuery.error,
    refetch: () => {
      void tasksQuery.refetch();
      void eventsQuery.refetch();
    },
  };

  const pagerLabel = view === "days" ? "days" : narrow ? "days" : "week";
  return (
    <div className="c2-stack">
      <header className="c2-head">
        <RichMenu
          width={300}
          trigger={(open) => (
            <button
              type="button"
              aria-label="New"
              title={open ? undefined : "New"}
              aria-expanded={open}
              data-page-add=""
              className="nx-btn nx-btn-secondary page-add"
            >
              <LuPlus size={18} aria-hidden="true" />
            </button>
          )}
          items={[
            {
              art: "event",
              title: "New Event",
              sub: "Blocks time on your calendar",
              onClick: newEvent,
            },
            {
              art: "task",
              title: "New Task",
              sub: "Placed into a free hour",
              kbd: "N",
              onClick: () => setComposerOpen(true),
            },
          ]}
        />
        <h1 className="c2-title">Calendar</h1>
        <span data-c2-range="" className="c2-span">
          {view === "week"
            ? spanLabel(weekDays, !narrow)
            : spanLabel(agendaDays, false)}
        </span>
        <span className="c2-head-right">
          <span className="c2-pager">
            {(
              [
                [-1, `Previous ${pagerLabel}`, FiChevronLeft],
                [1, `Next ${pagerLabel}`, FiChevronRight],
              ] as const
            ).map(([dir, label, Icon]) => (
              <button
                key={dir}
                type="button"
                aria-label={label}
                title={label}
                className="nx-btn nx-btn-text c2-page"
                data-c2-page={dir}
                onClick={() => page(dir)}
              >
                <Icon size={16} aria-hidden="true" />
              </button>
            ))}
          </span>
          <button
            type="button"
            className="nx-btn nx-btn-secondary"
            onClick={goToday}
          >
            Today
          </button>
          <button
            type="button"
            data-c2-hide-done=""
            aria-pressed={hideDone}
            className={`nx-btn nx-btn-text c2-hide${narrow ? " is-icon" : ""}`}
            aria-label="Hide done"
            title={hideDoneTitle(hideDone, doneHidden)}
            onClick={() => setHideDone(!hideDone)}
          >
            {hideDone ? (
              <FiEyeOff size={15} aria-hidden="true" />
            ) : (
              <FiEye size={15} aria-hidden="true" />
            )}
            {narrow ? null : <span>Hide done</span>}
          </button>
          <span className={`c2-seg${narrow ? " is-narrow" : ""}`}>
            <Seg2
              value={view}
              onChange={(v) => setView(v === "days" ? "days" : "week")}
              options={[
                ["week", narrow ? "3 days" : "Week"],
                ["days", "Agenda"],
              ]}
            />
          </span>
        </span>
      </header>
      <StScreen query={combined} kind="calendar" screen="calendar">
        <div key={view} className="nx-swap c2-body">
          {view === "week" ? (
            <WeekView
              days={weekDays}
              blocks={visible}
              today={today}
              nowHour={hour}
              start={bounds.start}
              end={bounds.end}
              projects={projects}
              draft={draft}
              onSlot={onSlot}
              onSave={onSave}
              onCancel={() => setDraft(null)}
              onOpen={onOpen}
              onDone={onDone}
              onRename={onRename}
              onDelete={onDelete}
              dragProps={drag?.dragProps}
            />
          ) : (
            <DaysView
              days={agendaDays}
              blocks={visible}
              loose={loose}
              today={today}
              n={n}
              onN={setN}
              onPage={page}
              projects={projects}
              onOpen={onOpen}
              dragProps={drag?.dragProps}
              carryAt={carryAt}
            />
          )}
        </div>
      </StScreen>
    </div>
  );
}
