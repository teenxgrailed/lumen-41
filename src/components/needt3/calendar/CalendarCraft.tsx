"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { LuPlus } from "react-icons/lu";

import { formatInTimeZone, fromZonedTime, newDate } from "@/lib/date-utils";
import { addDays, addMinutes, hhmm, hourOf, stamp } from "@/lib/needt3/derive";
import { useSchedule } from "@/lib/needt3/hooks/account";
import {
  useCalendars,
  useCreateEvent,
  useEventLifecycle,
  useEvents,
  useUpdateEvent,
} from "@/lib/needt3/hooks/events";
import {
  useCreatePersonal,
  useMarkEventPersonal,
  usePersonalBands,
  useQuickPersonal,
} from "@/lib/needt3/hooks/personal";
import { useProjects } from "@/lib/needt3/hooks/projects";
import {
  useSetPref,
  useSettings,
  useTimeZone,
} from "@/lib/needt3/hooks/settings";
import { useTaskView } from "@/lib/needt3/hooks/task-view";
import { useCreateTask, useTasks } from "@/lib/needt3/hooks/tasks";
import { showsTask } from "@/lib/needt3/task-view";
import { notify } from "@/lib/notifications";
import type { DayBand } from "@/lib/personal-time-days";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { V3DragProvider, useV3Drag } from "../drag/DragHost";
import { RichMenu } from "../menu/RichMenu";
import { type PeekAnchor, PersonalPeek } from "../personal/PersonalPeek";
import { personalMenuItems } from "../personal/menu-items";
import { CalendarFaces } from "../phone/calendar/CalendarFaces";
import type { CalendarController } from "../phone/calendar/useCalendarController";
import { useDesignV3 } from "../root/V3Root";
import { StarterGameSlot } from "../starter-game/StarterGameSlot";
import { StScreen } from "../states/StScreen";
import { TaskViewGear, TaskViewToggle } from "../task/TaskViewGear";
import { CompletionScope, useCompletion } from "../task/useCompletion";
import { CalEmpty } from "./CalEmpty";
import { CREATE_KINDS, type CreateKind, type CreateSpec } from "./CreateCard";
import { AGENDA_SIZES, type AgendaSize, DaysView } from "./DaysView";
import { Seg2 } from "./Seg2";
import { type Draft, type WeekHandle, WeekView } from "./WeekView";
import {
  type CalItem,
  type CalTimed,
  calendarItems,
  canEditEvent,
} from "./blocks";
import { calendarEmptyState } from "./empty";
import { daySpan, freeSlot, spanLabel, weekStart } from "./layout";
import { workHoursOf } from "./strip";

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
  if (!v3) return null;
  // the shell's drag host when it has one; until then the calendar's own
  const desktop = (ctl: CalendarController) =>
    host ? (
      <CalendarScreen ctl={ctl} />
    ) : (
      <V3DragProvider>
        <CalendarScreen ctl={ctl} />
      </V3DragProvider>
    );
  // the face is chosen, and the route's state kept, in CalendarFaces: one
  // controller, handed to the phone face and to this one
  return <CalendarFaces desktop={desktop} />;
}

function CalendarScreen({ ctl }: { ctl: CalendarController }) {
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
  const {
    viewLocal,
    setViewLocal,
    hideLocal,
    setHideLocal,
    nLocal,
    setNLocal,
    weekFrom,
    setWeekFrom,
    narrowFrom,
    setNarrowFrom,
    agendaFrom,
    setAgendaFrom,
    draft,
    setDraft,
  } = ctl;
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
  /* The create card opens on the type made last (prefs `calCreateKind`). */
  const [kindLocal, setKindLocal] = useState<CreateKind | null>(null);
  const createKind: CreateKind =
    kindLocal ??
    (CREATE_KINDS.some(([k]) => k === prefs.calCreateKind)
      ? (prefs.calCreateKind as CreateKind)
      : "event");
  const rememberKind = (k: CreateKind) => {
    if (k === createKind) return;
    setKindLocal(k);
    save("calCreateKind", k);
  };

  /* What is on screen: a week (or three days from a day when narrow) and the
     Agenda's own span, both paged. */
  const thisWeek = weekStart(today, weekStartDay);
  const agendaDays = daySpan(agendaFrom ?? today, n);
  /* The Week is an endless strip (WeekView): it opens on the saved day, else
     this week (today when narrow), and reports the first day in view as it
     scrolls so the header can say which days those are. */
  const weekHandle = useRef<WeekHandle>(null);
  const weekOpen = narrow ? (narrowFrom ?? today) : (weekFrom ?? thisWeek);
  const [seen, setSeen] = useState<string | null>(null);
  const stripN = narrow ? 3 : 7;
  const weekDays = daySpan(seen ?? weekOpen, stripN);

  const tasksQuery = useTasks();
  // `GET /api/events` has no range filter: the whole list is read once and
  // each day's blocks are cut from it in memory, so scrolling never refetches.
  const eventsQuery = useEvents();
  const schedule = useSchedule().data;
  const work = useMemo(() => workHoursOf(schedule), [schedule]);
  const projects = useProjects().data;
  const calendars = useCalendars().data;
  // where an event can be written: the person's enabled Needt calendars
  const writable = useMemo(
    () =>
      (calendars ?? [])
        .filter((c) => c.type === "LOCAL" && c.enabled !== false)
        .map((c) => ({ id: c.id, name: c.name })),
    [calendars]
  );
  const calendarNames = useMemo(
    () => new Map((calendars ?? []).map((c) => [c.id, c.name])),
    [calendars]
  );
  const ownCalendarIds = useMemo(
    () => new Set((calendars ?? []).map((c) => c.id)),
    [calendars]
  );
  // the task view's Completed setting, on top of this screen's Hide done
  const taskView = useTaskView();
  // a ticked task still playing its exit stays on the grid until it is done
  const completion = useCompletion();
  const { hold } = completion;
  const shownTasks = useMemo(
    () =>
      hold(tasksQuery.data ?? []).filter((t) => showsTask(t, taskView, today)),
    [tasksQuery.data, hold, taskView, today]
  );
  const { timed, loose, doneHidden } = useMemo(
    () =>
      calendarItems({
        tasks: shownTasks,
        events: eventsQuery.data ?? [],
        projects,
        calendarNames,
        ownCalendarIds,
        today,
        hideDone,
      }),
    [
      shownTasks,
      eventsQuery.data,
      projects,
      calendarNames,
      ownCalendarIds,
      today,
      hideDone,
    ]
  );
  const byDate = useMemo(() => {
    const m = new Map<string, CalTimed[]>();
    for (const b of timed) {
      const list = m.get(b.date);
      if (list) list.push(b);
      else m.set(b.date, [b]);
    }
    return m;
  }, [timed]);
  const shownDays = new Set(agendaDays.map((d) => d.date));
  const visible = timed.filter((b) => shownDays.has(b.date));

  const personal = usePersonalBands();
  const keepPersonal = useQuickPersonal();
  const createPersonal = useCreatePersonal();
  const createTask = useCreateTask();
  const markPersonal = useMarkEventPersonal();
  const [personalPeek, setPersonalPeek] = useState<{
    band: DayBand;
    anchor: PeekAnchor;
  } | null>(null);
  const onPersonal = useCallback((band: DayBand, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setPersonalPeek({
      band,
      anchor: { top: r.top, left: r.left, right: r.right },
    });
  }, []);

  const updateEvent = useUpdateEvent();
  const lifecycle = useEventLifecycle();
  const createEvent = useCreateEvent();

  const undoable = (message: string, undo: () => Promise<void>) =>
    notify.success(message, {
      action: { label: "Undo", onClick: () => void undo() },
    });
  const ignore = () => undefined;

  const onOpen = useCallback(
    (id: string) => router.push(`/tasks?task=${encodeURIComponent(id)}`),
    [router]
  );
  // the shared completion: the pop, the strike, the fold and the Undo notice
  const onDone = (b: CalItem) =>
    completion.check({ id: b.id, done: !!b.done, title: b.title });
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
  const onSlot = (date: string, at: number, end?: number) =>
    setDraft({ date, at, end, key: newDate().getTime() });
  const onDraft = (patch: Partial<Pick<Draft, "at" | "end" | "kind">>) => {
    if (patch.kind) rememberKind(patch.kind);
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };
  /* The create card's spec → the same endpoints the composer and the agent
     use: a task (pinned at the range, or placed by Needt), an event in a
     Needt calendar, or personal time. */
  const onCreate = (spec: CreateSpec) => {
    setDraft(null);
    const startAt = stamp(spec.date, spec.at) ?? `${spec.date}T09:00`;
    const minutes = Math.max(15, Math.round((spec.end - spec.at) * 60));
    const endAt = addMinutes(startAt, minutes) ?? startAt;
    const when = `${hhmm(spec.at)}–${hhmm(spec.end)}`;
    rememberKind(spec.kind);
    if (spec.kind === "task") {
      void createTask
        .mutateAsync({
          draft: {
            title: spec.title,
            projectId: spec.projectId,
            estimatedMinutes: minutes,
            dueDate: spec.date,
            ...(spec.pin
              ? {
                  scheduledStart: startAt,
                  scheduledEnd: endAt,
                  isFixed: true,
                  auto: false,
                }
              : { auto: true }),
          },
        })
        .then(({ undo }) =>
          undoable(
            spec.pin
              ? `Added ${quote(spec.title)} · ${when}`
              : `Added ${quote(spec.title)}`,
            undo
          )
        )
        .catch(ignore);
      return;
    }
    if (spec.kind === "event") {
      // a Needt (LOCAL) calendar, created once if missing — never a synced one
      void createEvent({
        title: spec.title,
        startAt,
        endAt,
        isAllDay: false,
        calendarId: spec.calendarId,
      })
        .then(({ undo }) =>
          undoable(`Added ${quote(spec.title)} · ${when}`, undo)
        )
        .catch(ignore);
      return;
    }
    const start = fromZonedTime(`${startAt}:00`, tz).toISOString();
    const end = fromZonedTime(`${endAt}:00`, tz).toISOString();
    void createPersonal(
      spec.preset
        ? { kind: spec.preset.kind, start, end }
        : { kind: "custom", title: spec.title || "Personal time", start, end },
      spec.preset
        ? `${spec.preset.emoji} ${spec.preset.title} · ${when}`
        : undefined
    );
  };
  const newEvent = useCallback(() => {
    setViewLocal("week");
    setWeekFrom(null);
    setNarrowFrom(null);
    weekHandle.current?.goTo(narrow ? today : thisWeek);
    setDraft({
      date: today,
      at: freeSlot(timed, today, hour, 24),
      kind: "event",
      key: newDate().getTime(),
    });
  }, [
    today,
    thisWeek,
    narrow,
    timed,
    hour,
    setViewLocal,
    setWeekFrom,
    setNarrowFrom,
    setDraft,
  ]);

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
    weekHandle.current?.jump(dir * stripN);
  };
  const goToday = () => {
    setWeekFrom(null);
    setNarrowFrom(null);
    setAgendaFrom(null);
    weekHandle.current?.goTo(narrow ? today : thisWeek);
  };
  const settled = (date: string) =>
    narrow ? setNarrowFrom(date) : setWeekFrom(date);

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

  // the empty week's card or hint; it steps aside while a draft is open
  const empty = draft
    ? null
    : calendarEmptyState({
        feeds: calendars,
        items: [...timed, ...loose],
        days: (view === "week" ? weekDays : agendaDays).map((d) => d.date),
      });

  const pagerLabel = view === "days" ? "days" : narrow ? "days" : "week";
  const content = (
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
            ...personalMenuItems((preset) => void keepPersonal(preset)),
          ]}
        />
        <h1 className="c2-title">Calendar</h1>
        <span data-c2-range="" className="c2-span">
          {view === "week"
            ? spanLabel(weekDays, !narrow)
            : spanLabel(agendaDays, false)}
        </span>
        <span className="c2-head-right">
          <TaskViewGear
            scope="calendar"
            extra={
              <TaskViewToggle
                label="Hide done"
                on={hideDone}
                onChange={setHideDone}
                hint={
                  hideDone && doneHidden > 0
                    ? `${doneHidden} done ${doneHidden === 1 ? "task" : "tasks"} hidden on the calendar.`
                    : undefined
                }
              />
            }
          />
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
      <StarterGameSlot screen="calendar" />
      <StScreen query={combined} kind="calendar" screen="calendar">
        <div key={view} className="nx-swap c2-body">
          {view === "week" ? (
            <WeekView
              handle={weekHandle}
              n={stripN}
              initial={weekOpen}
              blocks={byDate}
              today={today}
              nowHour={hour}
              work={work}
              onFirst={setSeen}
              onSettle={settled}
              projects={projects}
              draft={draft}
              onSlot={onSlot}
              onCreate={onCreate}
              onDraft={onDraft}
              createKind={createKind}
              calendars={writable}
              onCancel={() => setDraft(null)}
              onOpen={onOpen}
              onDone={onDone}
              onRename={onRename}
              onDelete={onDelete}
              dragProps={drag?.dragProps}
              resizeProps={drag?.resizeProps}
              personal={personal}
              onPersonal={onPersonal}
              onMarkPersonal={(b) =>
                void markPersonal({ id: b.id, title: b.title })
              }
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
              personal={personal}
              onPersonal={onPersonal}
            />
          )}
          <CalEmpty state={empty} onAdd={newEvent} />
        </div>
      </StScreen>
      {personalPeek ? (
        <PersonalPeek
          key={personalPeek.band.key}
          band={personalPeek.band}
          anchor={personalPeek.anchor}
          onClose={() => setPersonalPeek(null)}
        />
      ) : null}
    </div>
  );
  return <CompletionScope value={completion}>{content}</CompletionScope>;
}
