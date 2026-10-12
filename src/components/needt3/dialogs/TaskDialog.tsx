"use client";

import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  LuArchive,
  LuArrowRight,
  LuCalendar,
  LuCalendarClock,
  LuCalendarDays,
  LuCheck,
  LuCircleCheck,
  LuClock,
  LuCopy,
  LuEllipsis,
  LuFileText,
  LuFlag,
  LuFolder,
  LuGripVertical,
  LuHourglass,
  LuLink,
  LuPlus,
  LuSearch,
  LuSun,
  LuSunrise,
  LuTrash2,
  LuX,
} from "react-icons/lu";

import { useNeedtReducedMotion } from "@/components/providers/MotionRuntime";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { addDays, addMinutes, at, project } from "@/lib/needt3/derive";
import { findListItem } from "@/lib/needt3/hooks/core";
import { useCreateDoc } from "@/lib/needt3/hooks/docs";
import { useCalendars, useEventLifecycle } from "@/lib/needt3/hooks/events";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import {
  useCreateTask,
  useTask,
  useTaskParts,
  useTrashTask,
  useUpdateTask,
} from "@/lib/needt3/hooks/tasks";
import type { V3Task, V3TaskPatch } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { useDesignV3 } from "../root/V3Root";
import { TaskDialogCalendar } from "./TaskDialogCalendar";
import {
  type ChipBox,
  TD_CHUNK,
  TD_DUR,
  TD_PRIO,
  chunkPatch,
  chunkPressed,
  datePatch,
  dateValue,
  duplicateDraft,
  fixedPatch,
  foldChips,
  isSchedDefault,
  moveItem,
  nextMonday,
  placementHint,
  schedSummary,
  tdAgo,
  tdDayName,
  tdDur,
  timePatch,
} from "./TaskDialogModel";

const TEXT_SAVE_MS = 450;
const SCHED_PREF = "needt3.taskSchedOpen";

type PopKey =
  | "date"
  | "duration"
  | "project"
  | "priority"
  | "deadline"
  | "more";
interface Pop {
  key: PopKey;
  x: number;
  y: number;
}
interface ChipDef {
  k: Exclude<PopKey, "deadline" | "more">;
  glyph: ReactNode;
  value: string | null;
  empty: string;
  title: string;
  danger?: boolean;
  dot?: string | null;
}

/** The tick plays when the check closes, not when a done task opens. */
function useTick(on: boolean, key: string) {
  const reduced = useNeedtReducedMotion();
  const prev = useRef({ on, key });
  const [tick, setTick] = useState(false);
  useEffect(() => {
    const p = prev.current;
    setTick(p.key === key && !p.on && on && !reduced);
    prev.current = { on, key };
  }, [on, key, reduced]);
  return tick;
}

/** Scheduling open/closed, remembered per device ($P needtSettings.taskSchedOpen). */
function useSchedOpen(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(SCHED_PREF) === "1");
    } catch {
      /* storage blocked: closed by default */
    }
  }, []);
  const set = useCallback((v: boolean) => {
    setOpen(v);
    try {
      window.localStorage.setItem(SCHED_PREF, v ? "1" : "0");
    } catch {
      /* storage blocked */
    }
  }, []);
  return [open, set];
}

/**
 * Opens the task editor for `taskId` (the `?task=` search param). The task
 * comes from any cached list at once, then from `GET /api/tasks/[id]`.
 */
export function TaskDialogHost({
  taskId,
  onClose,
}: {
  taskId: string | null;
  onClose: () => void;
}) {
  const v3 = useDesignV3();
  const qc = useQueryClient();
  const one = useTask(taskId);
  const cached = taskId
    ? findListItem<V3Task>(qc, qk.tasks(), taskId)
    : undefined;
  const task = one.data ?? cached ?? null;
  const missing = !!taskId && one.isError && !cached;
  useEffect(() => {
    if (!missing) return;
    notify.error("That task is gone — it may have been deleted.");
    onClose();
  }, [missing, onClose]);
  if (!v3 || !taskId || !task || task.trashedAt) return null;
  return <TaskDialog key={task.id} task={task} onClose={onClose} />;
}

/**
 * THE TASK EDITOR ($P/Dialogs.jsx TaskDialog): one compact card. The title,
 * a row of chips (Date · Duration · Project · Priority), notes, subtasks,
 * the First step, and Scheduling under ⋯. Every edit saves at once (text
 * after a short pause); closing after a change says so, with Undo back to
 * the task as it was when the card opened.
 */
export function TaskDialog({
  task: t,
  onClose,
}: {
  task: V3Task;
  onClose: () => void;
}) {
  const container = useV3PortalContainer();
  const tz = useTimeZone();
  const today = formatInTimeZone(newDate(), tz, "yyyy-MM-dd");
  const projects = useProjects().data ?? [];
  const update = useUpdateTask();
  const trash = useTrashTask();
  const create = useCreateTask();
  const parts = useTaskParts();
  const createDoc = useCreateDoc();
  const events = useEventLifecycle();
  const calendars = useCalendars();

  const [title, setTitle] = useState(t.title);
  const [notes, setNotes] = useState(t.notes ?? "");
  const [entry, setEntry] = useState(t.entry ?? "");
  const [pop, setPop] = useState<Pop | null>(null);
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState("");
  const [addText, setAddText] = useState("");
  const [partText, setPartText] = useState<Record<string, string>>({});
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const [subTick, setSubTick] = useState<string | null>(null);
  const [schedOpen, setSchedOpen] = useSchedOpen();
  const [flash, setFlash] = useState(0);
  const checkTick = useTick(t.done, t.id);

  const cardRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [folded, setFolded] = useState<string[]>([]);
  const [chipW, setChipW] = useState(0);

  /* Autosave bookkeeping: the task as it opened, which fields changed, and
     the text edits waiting for a pause. */
  const before = useRef(t);
  const changed = useRef(new Set<keyof V3TaskPatch>());
  const quiet = useRef(false);
  const pending = useRef<V3TaskPatch>({});
  const timer = useRef<number | null>(null);

  const send = useCallback(
    (patch: V3TaskPatch) => {
      for (const k of Object.keys(patch) as (keyof V3TaskPatch)[])
        changed.current.add(k);
      setFlash((n) => n + 1);
      return update.mutateAsync({ id: t.id, patch }).catch(() => undefined);
    },
    [t.id, update]
  );
  const flush = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = {};
    if (Object.keys(p).length) void send(p);
  }, [send]);
  const later = (patch: V3TaskPatch) => {
    pending.current = { ...pending.current, ...patch };
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, TEXT_SAVE_MS);
  };
  /* One PUT, not two: text still waiting for its pause rides along with
     this edit, so the two never race on the same revision (If-Match). */
  const emit = (patch: V3TaskPatch) => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    const p = { ...pending.current, ...patch };
    pending.current = {};
    void send(p);
  };

  const close = useCallback(() => {
    flush();
    const keys = [...changed.current];
    if (keys.length && !quiet.current) {
      const back: Record<string, unknown> = {};
      for (const k of keys) back[k] = before.current[k];
      notify.success("Changes saved", {
        action: {
          label: "Undo",
          onClick: () =>
            void update
              .mutateAsync({ id: t.id, patch: back as V3TaskPatch })
              .catch(() => undefined),
        },
      });
    }
    changed.current = new Set();
    onClose();
  }, [flush, onClose, t.id, update]);

  /* Unmounting (route change, the task vanishing) saves the text that was
     still waiting for its pause rather than dropping it. */
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);
  useEffect(() => {
    if (!flash) return undefined;
    const h = window.setTimeout(() => setFlash(0), 1400);
    return () => window.clearTimeout(h);
  }, [flash]);

  /* The notes field grows with its text. */
  useLayoutEffect(() => {
    const n = notesRef.current;
    if (!n) return;
    n.style.height = "auto";
    n.style.height = `${n.scrollHeight}px`;
  }, [notes]);

  useEffect(() => {
    const row = chipsRef.current;
    if (!row || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setChipW(row.clientWidth));
    ro.observe(row);
    return () => ro.disconnect();
  }, []);

  /* A click outside an open popover / menu closes it. */
  useEffect(() => {
    if (!pop && !menu) return undefined;
    const h = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (popRef.current?.contains(el)) return;
      if (el.closest?.("[data-tdc-trigger]")) return;
      setPop(null);
      setMenu(false);
    };
    document.addEventListener("mousedown", h, true);
    return () => document.removeEventListener("mousedown", h, true);
  }, [pop, menu]);

  const toggleDone = () => emit({ done: !t.done });

  const openPop = (key: PopKey, anchor: HTMLElement | null) => {
    if (pop?.key === key) {
      setPop(null);
      return;
    }
    const card = cardRef.current;
    if (!anchor || !card) return;
    const a = anchor.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    setQ("");
    setMenu(false);
    setPop({ key, x: a.left - c.left, y: a.bottom - c.top + 6 });
  };

  /* ── derived ── */
  const proj = project(t.projectId, projects);
  const late = !t.done && !!t.dueDate && t.dueDate < today;
  const prioLabel = TD_PRIO.find((p) => p[0] === t.priority)?.[1] ?? null;
  const tparts = t.parts ?? [];
  const closed = tparts.filter((p) => p.done).length;
  const firstOpen = tparts.find((p) => !p.done);
  const schedDefault = isSchedDefault(t);
  const inProgress =
    !t.done && (t.status === "in_progress" || t.Stage === "doing");
  const updated = tdAgo(t.updatedAt, newDate().getTime(), tz);
  const chipDefs: ChipDef[] = [
    {
      k: "date",
      glyph: <LuCalendar size={13} aria-hidden />,
      value: dateValue(t, today),
      empty: "Date",
      danger: late,
      title: late
        ? "Past its date and still open — move it or let it go"
        : "Date and time",
    },
    {
      k: "duration",
      glyph: <LuHourglass size={13} aria-hidden />,
      value: tdDur(t.estimatedMinutes),
      empty: "Duration",
      title: "Duration",
    },
    {
      k: "project",
      glyph: <LuFolder size={13} aria-hidden />,
      dot: proj ? (proj.color ?? "var(--text-quaternary)") : null,
      value: proj?.name ?? null,
      empty: "Project",
      title: "Project",
    },
    {
      k: "priority",
      glyph: <LuFlag size={13} aria-hidden />,
      value: prioLabel,
      empty: "Priority",
      danger: t.priority === "urgent",
      title: t.priority === "urgent" ? "Urgent priority" : "Priority",
    },
    //todo Labels (Task.tags via tagIds), Repeat (needs map.ts to write
    // isRecurring with recurrenceRule) and Who (workspace members) chips.
  ];
  const chipSig = chipDefs.map((c) => `${c.k}:${c.value ?? ""}`).join("|");
  /* Chip row: one line, always; chips that don't fit fold into "+N". */
  useLayoutEffect(() => {
    const row = chipsRef.current;
    const m = measureRef.current;
    if (!row || !m) return;
    const cs = getComputedStyle(row);
    const avail =
      row.clientWidth -
      parseFloat(cs.paddingLeft) -
      parseFloat(cs.paddingRight);
    const gap = parseFloat(cs.columnGap) || 0;
    const items: ChipBox[] = Array.from(
      m.querySelectorAll<HTMLElement>("[data-k]")
    ).map((el) => ({
      k: el.dataset.k ?? "",
      filled: !!el.dataset.filled,
      w: el.getBoundingClientRect().width,
    }));
    const more = m.querySelector(".tdc-more");
    const moreW = more ? more.getBoundingClientRect().width : 40;
    const out = foldChips(items, avail, gap, moreW);
    if (out.join() !== folded.join()) setFolded(out);
  }, [chipSig, chipW, folded]);
  const foldedDefs = chipDefs.filter((c) => folded.includes(c.k));
  const foldedOpen = !!pop && foldedDefs.some((c) => c.k === pop.key);
  const foldedTitle = foldedDefs
    .map((c) => c.value ?? `No ${c.empty.toLowerCase()}`)
    .join(" · ");

  /* ── edits ── */
  const editTitle = (v: string) => {
    setTitle(v);
    if (v.trim()) later({ title: v });
  };
  const commitTitle = () => {
    if (!title.trim()) {
      const v = before.current.title || "Untitled";
      setTitle(v);
      emit({ title: v });
    } else flush();
  };
  const editNotes = (v: string) => {
    setNotes(v);
    later({ notes: v.trim() ? v : null });
  };
  const editEntry = (v: string) => {
    setEntry(v);
    later({ entry: v.trim() ? v : null });
  };
  const setDate = (day: string | null) => {
    setPop(null);
    emit(datePatch(t, day, today));
  };
  const setTime = (v: string | null) => {
    const p = timePatch(t, v, today);
    if (p) emit(p);
  };
  const quietClose = () => {
    quiet.current = true;
    close();
  };

  const toEventStart = () => {
    const day = t.dueDate || today;
    const h = at(t) ?? 9;
    const hh = String(Math.floor(h)).padStart(2, "0");
    const mm = String(Math.round((h % 1) * 60)).padStart(2, "0");
    return `${day}T${hh}:${mm}`;
  };

  /* A conversion is make-then-trash. If the trash fails, the new object is
     taken back, so the person never ends up with both. */
  const trashOrTakeBack = async (
    undoMade: () => Promise<void>,
    what: "event" | "document"
  ) => {
    try {
      return await trash.trash(t.id);
    } catch {
      await undoMade().catch(() => undefined);
      notify.error(`Could not convert the task to a ${what}. Nothing changed.`);
      return null;
    }
  };

  const act = {
    duplicate: async () => {
      setMenu(false);
      try {
        const { result, undo } = await create.mutateAsync({
          draft: duplicateDraft(t),
        });
        if (result)
          for (const [i, p] of tparts.entries())
            await parts.add(result.id, p.title, i).catch(() => undefined);
        notify.success("Duplicated", {
          action: { label: "Undo", onClick: () => void undo() },
        });
      } catch {
        /* the hook reverted and said so */
      }
    },
    toEvent: async () => {
      setMenu(false);
      const feeds = calendars.data ?? [];
      const feed =
        feeds.find((f) => f.enabled !== false && f.type === "LOCAL") ??
        feeds.find((f) => f.enabled !== false);
      if (!feed) {
        notify.error("Connect or create a calendar first.");
        return;
      }
      const startAt = toEventStart();
      try {
        const made = await events.mutateAsync({
          create: {
            title: t.title,
            startAt,
            endAt: addMinutes(startAt, t.estimatedMinutes || 60) ?? startAt,
            isAllDay: false,
            calendarId: feed.id,
          },
        });
        const gone = await trashOrTakeBack(made.undo, "event");
        if (!gone) return;
        quietClose();
        notify.success("Converted to an event", {
          action: {
            label: "Undo",
            onClick: () => void made.undo().then(gone.undo),
          },
        });
      } catch {
        /* reverted by the hook */
      }
    },
    toDoc: async () => {
      setMenu(false);
      try {
        //todo Carry the notes into the document body once v3 can write
        // page blocks.
        const made = await createDoc.mutateAsync({
          draft: { title: t.title, projectId: t.projectId },
        });
        const gone = await trashOrTakeBack(made.undo, "document");
        if (!gone) return;
        quietClose();
        notify.success("Converted to a document", {
          action: {
            label: "Undo",
            onClick: () => void made.undo().then(gone.undo),
          },
        });
      } catch {
        /* reverted by the hook */
      }
    },
    move: () => {
      setMenu(false);
      openPop(
        "project",
        cardRef.current?.querySelector<HTMLElement>(
          '[data-tdc-trigger="project"]'
        ) ?? moreRef.current
      );
    },
    sched: () => {
      setMenu(false);
      setSchedOpen(!schedOpen);
    },
    progress: () => {
      setMenu(false);
      emit({ Stage: inProgress ? "todo" : "doing" });
    },
    link: () => {
      setMenu(false);
      const url = `${window.location.origin}/tasks?task=${encodeURIComponent(t.id)}`;
      void navigator.clipboard
        ?.writeText(url)
        .then(() => notify.success("Link copied"))
        .catch(() => notify.error("Could not copy the link."));
    },
    remove: async () => {
      setMenu(false);
      try {
        const { undo } = await trash.trash(t.id);
        quietClose();
        notify.success("Moved to Trash", {
          action: { label: "Undo", onClick: () => void undo() },
        });
      } catch {
        /* reverted by the hook */
      }
    },
  };

  /* ── subtasks ── */
  const partTitle = (id: string, title: string) => partText[id] ?? title;
  const commitPart = (id: string, title: string) => {
    const v = partText[id];
    setPartText((m) => {
      const rest = { ...m };
      delete rest[id];
      return rest;
    });
    if (v === undefined || v === title) return;
    if (!v.trim()) void parts.remove(t.id, id).catch(() => undefined);
    else void parts.update(t.id, id, { title: v }).catch(() => undefined);
  };
  const reorder = (from: number, to: number) => {
    const next = moveItem(tparts, from, to);
    next.forEach((p, i) => {
      if (tparts[i]?.id !== p.id)
        void parts.update(t.id, p.id, { position: i }).catch(() => undefined);
    });
  };

  /* ── popover bodies ── */
  const ql = q.trim().toLowerCase();
  const popBody = (() => {
    if (!pop) return null;
    if (pop.key === "date" || pop.key === "deadline") {
      const isDl = pop.key === "deadline";
      const val = isDl ? t.deadline : t.dueDate;
      const pick = isDl
        ? (v: string | null) => {
            setPop(null);
            emit(v ? { deadline: v } : { deadline: null, hardDeadline: false });
          }
        : setDate;
      const quick: [string, ReactNode, string | null][] = [
        ["Today", <LuSun key="i" size={14} aria-hidden />, today],
        [
          "Tomorrow",
          <LuSunrise key="i" size={14} aria-hidden />,
          addDays(today, 1),
        ],
        [
          "Next week",
          <LuCalendarDays key="i" size={14} aria-hidden />,
          nextMonday(today),
        ],
      ];
      if (!isDl)
        quick.push([
          "Someday",
          <LuArchive key="i" size={14} aria-hidden />,
          null,
        ]);
      const time = t.scheduledStart?.slice(11, 16) ?? "";
      return (
        <div className="tdc-pop-date">
          <div className="tdc-quick">
            {quick.map(([label, glyph, v]) => (
              <button
                key={label}
                type="button"
                className={`tdc-quick-btn${val === v ? " is-on" : ""}`}
                onClick={() => pick(v)}
              >
                {glyph}
                <span>{label}</span>
              </button>
            ))}
          </div>
          <TaskDialogCalendar value={val} today={today} onPick={pick} />
          {isDl ? (
            <div className="tdc-pop-row">
              <span className="tdc-pop-label">Hard deadline</span>
              <label
                className="nt-switch"
                data-checked={t.hardDeadline ? "true" : undefined}
                style={{ position: "relative" }}
              >
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="Hard deadline"
                  checked={t.hardDeadline}
                  onChange={(e) => emit({ hardDeadline: e.target.checked })}
                />
                <span className="nt-switch-track">
                  <span className="nt-switch-knob" />
                </span>
              </label>
            </div>
          ) : (
            <div className="tdc-pop-row">
              <span className="tdc-pop-label">
                <LuClock size={13} aria-hidden />
                Time
              </span>
              <input
                className="tdc-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value || null)}
                aria-label="Time"
              />
              {time ? (
                <button
                  type="button"
                  className="nx-btn nx-btn-text nx-btn-sm"
                  onClick={() => setTime(null)}
                >
                  No time
                </button>
              ) : null}
            </div>
          )}
          {val ? (
            <button
              type="button"
              className="nx-btn nx-btn-text nx-btn-sm tdc-pop-clear"
              onClick={() => pick(null)}
            >
              {isDl ? "Remove deadline" : "Clear date"}
            </button>
          ) : null}
        </div>
      );
    }
    if (pop.key === "duration")
      return (
        <div className="tdc-pop-dur">
          <div className="tdc-dur-grid">
            {TD_DUR.map((m) => (
              <button
                key={m}
                type="button"
                className={`tdc-dur${t.estimatedMinutes === m ? " is-on" : ""}`}
                aria-pressed={t.estimatedMinutes === m}
                onClick={() => {
                  setPop(null);
                  emit({ estimatedMinutes: m });
                }}
              >
                {tdDur(m)}
              </button>
            ))}
          </div>
          {t.estimatedMinutes ? (
            <button
              type="button"
              className="nx-btn nx-btn-text nx-btn-sm tdc-pop-clear"
              onClick={() => {
                setPop(null);
                emit({ estimatedMinutes: null });
              }}
            >
              No duration
            </button>
          ) : null}
        </div>
      );
    if (pop.key === "project") {
      const hits = projects.filter(
        (p) => !ql || p.name.toLowerCase().includes(ql)
      );
      return (
        <div className="tdc-pop-list">
          <label className="tdc-search">
            <LuSearch size={13} aria-hidden />
            <input
              autoFocus
              placeholder="Find a project"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <div className="tdc-list">
            {!ql ? (
              <button
                type="button"
                className={`tdc-opt${!t.projectId ? " is-on" : ""}`}
                onClick={() => {
                  setPop(null);
                  emit({ projectId: null });
                }}
              >
                <span className="tdc-dot is-none" aria-hidden="true" />
                <span className="tdc-opt-text">No project</span>
                {!t.projectId ? <LuCheck size={14} aria-hidden /> : null}
              </button>
            ) : null}
            {hits.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`tdc-opt${t.projectId === p.id ? " is-on" : ""}`}
                onClick={() => {
                  setPop(null);
                  emit({ projectId: p.id });
                }}
              >
                <span
                  className="tdc-dot"
                  aria-hidden="true"
                  style={
                    {
                      "--tdc-hue": p.color || "var(--text-quaternary)",
                    } as CSSProperties
                  }
                />
                <span className="tdc-opt-text">{p.name}</span>
                {t.projectId === p.id ? (
                  <LuCheck size={14} aria-hidden />
                ) : null}
              </button>
            ))}
            {ql && !hits.length ? (
              <span className="tdc-empty">No project called “{q.trim()}”</span>
            ) : null}
          </div>
        </div>
      );
    }
    if (pop.key === "priority")
      return (
        <div className="tdc-list">
          {TD_PRIO.map(([k, label], i) => (
            <button
              key={k}
              type="button"
              className={`tdc-opt${t.priority === k ? " is-on" : ""}`}
              onClick={() => {
                setPop(null);
                emit({ priority: k });
              }}
            >
              <span className={`tdc-flag is-${k}`}>
                <LuFlag size={14} aria-hidden />
              </span>
              <span className="tdc-opt-text">{label}</span>
              <span className="tdc-opt-key">P{i + 1}</span>
              {t.priority === k ? <LuCheck size={14} aria-hidden /> : null}
            </button>
          ))}
          {/* //todo "No priority": priorityLevel is required on the v3 map. */}
        </div>
      );
    if (pop.key === "more")
      return (
        <div className="tdc-list" role="menu">
          {foldedDefs.map((c) => (
            <button
              key={c.k}
              type="button"
              role="menuitem"
              className={`tdc-opt${c.danger ? " is-danger" : ""}`}
              title={c.title}
              onClick={() => {
                setPop(null);
                openPop(c.k, moreRef.current);
              }}
            >
              <span className="tdc-flag">
                {c.dot ? (
                  <span
                    className="tdc-dot"
                    aria-hidden="true"
                    style={{ "--tdc-hue": c.dot } as CSSProperties}
                  />
                ) : (
                  c.glyph
                )}
              </span>
              <span className={`tdc-opt-text${c.value ? "" : " is-empty"}`}>
                {c.value ?? c.empty}
              </span>
            </button>
          ))}
        </div>
      );
    return null;
  })();

  const menuItems: [ReactNode, string, () => void][] = [
    [
      <LuCopy key="i" size={14} aria-hidden />,
      "Duplicate",
      () => void act.duplicate(),
    ],
    [
      <LuCalendar key="i" size={14} aria-hidden />,
      "Convert to event",
      () => void act.toEvent(),
    ],
    [
      <LuFileText key="i" size={14} aria-hidden />,
      "Convert to document",
      () => void act.toDoc(),
    ],
    [<LuFolder key="i" size={14} aria-hidden />, "Move to project…", act.move],
    [
      <LuCalendarClock key="i" size={14} aria-hidden />,
      schedOpen ? "Hide scheduling" : "Scheduling…",
      act.sched,
    ],
  ];
  if (!t.done)
    menuItems.push([
      <LuCircleCheck key="i" size={14} aria-hidden />,
      inProgress ? "Mark as to do" : "Mark in progress",
      act.progress,
    ]);
  menuItems.push([
    <LuLink key="i" size={14} aria-hidden />,
    "Copy link",
    act.link,
  ]);

  if (!container) return null;

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="tdc-scrim">
          <Dialog.Content
            ref={cardRef}
            className={`tdc-card${t.done ? " is-done" : ""}`}
            aria-describedby={undefined}
            onEscapeKeyDown={(e) => {
              if (pop || menu) {
                e.preventDefault();
                if (pop) setPop(null);
                else setMenu(false);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                toggleDone();
              }
            }}
          >
            <Dialog.Title className="sr-only">{title || "Task"}</Dialog.Title>
            <header className="tdc-head">
              <button
                type="button"
                className={`tdc-check${t.done ? " is-on" : inProgress ? " is-half" : ""}${checkTick ? " is-ticking" : ""}`}
                role="checkbox"
                aria-checked={t.done}
                aria-label={t.done ? "Mark not done" : "Mark done"}
                title={`${t.done ? "Reopen" : "Done"} · ⌘↵`}
                onClick={toggleDone}
              >
                {t.done ? <LuCheck size={14} aria-hidden /> : null}
              </button>
              <textarea
                className="tdc-title"
                rows={1}
                value={title}
                placeholder="Name it"
                aria-label="Title"
                onChange={(e) => editTitle(e.target.value.replace(/\n/g, " "))}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
              />
              <span className="tdc-head-end">
                <button
                  type="button"
                  data-tdc-trigger="menu"
                  className="tdc-icon-btn"
                  aria-label="More"
                  aria-expanded={menu}
                  aria-haspopup="menu"
                  onClick={() => {
                    setPop(null);
                    setMenu(!menu);
                  }}
                >
                  <LuEllipsis size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  className="tdc-icon-btn"
                  aria-label="Close"
                  title="Close · Esc"
                  onClick={close}
                >
                  <LuX size={16} aria-hidden />
                </button>
              </span>
              {menu ? (
                <div ref={popRef} className="tdc-pop tdc-menu" role="menu">
                  {menuItems.map(([glyph, label, fn]) => (
                    <button
                      key={label}
                      type="button"
                      role="menuitem"
                      className="tdc-opt"
                      onClick={fn}
                    >
                      <span className="tdc-flag">{glyph}</span>
                      <span className="tdc-opt-text">{label}</span>
                    </button>
                  ))}
                  <span className="tdc-sep" role="separator" />
                  <button
                    type="button"
                    role="menuitem"
                    className="tdc-opt is-danger"
                    onClick={() => void act.remove()}
                  >
                    <span className="tdc-flag">
                      <LuTrash2 size={14} aria-hidden />
                    </span>
                    <span className="tdc-opt-text">Delete</span>
                  </button>
                </div>
              ) : null}
            </header>

            <div ref={chipsRef} className="tdc-chips">
              {chipDefs
                .filter((c) => !folded.includes(c.k))
                .map((c) => (
                  <button
                    key={c.k}
                    type="button"
                    data-tdc-trigger={c.k}
                    className={`tdc-chip${c.value ? "" : " is-empty"}${c.danger ? " is-danger" : ""}`}
                    aria-expanded={pop?.key === c.k && !foldedOpen}
                    aria-haspopup="dialog"
                    title={c.title}
                    onClick={(e) => openPop(c.k, e.currentTarget)}
                  >
                    {c.dot ? (
                      <span
                        className="tdc-dot"
                        aria-hidden="true"
                        style={{ "--tdc-hue": c.dot } as CSSProperties}
                      />
                    ) : (
                      c.glyph
                    )}
                    <span className="tdc-chip-text">{c.value ?? c.empty}</span>
                  </button>
                ))}
              {foldedDefs.length ? (
                <button
                  ref={moreRef}
                  type="button"
                  data-tdc-trigger="more"
                  className="tdc-chip tdc-more"
                  aria-haspopup="menu"
                  aria-expanded={pop?.key === "more" || foldedOpen}
                  aria-label={`${foldedDefs.length} more: ${foldedTitle}`}
                  title={foldedTitle}
                  onClick={(e) => openPop("more", e.currentTarget)}
                >
                  <span className="tdc-chip-text">+{foldedDefs.length}</span>
                </button>
              ) : null}
              <div
                ref={measureRef}
                className="tdc-chips-measure"
                aria-hidden="true"
                inert
              >
                {chipDefs.map((c) => (
                  <span
                    key={c.k}
                    data-k={c.k}
                    data-filled={c.value ? "1" : ""}
                    className={`tdc-chip${c.value ? "" : " is-empty"}`}
                  >
                    {c.dot ? (
                      <span className="tdc-dot" aria-hidden="true" />
                    ) : (
                      c.glyph
                    )}
                    <span className="tdc-chip-text">{c.value ?? c.empty}</span>
                  </span>
                ))}
                <span className="tdc-chip tdc-more">
                  <span className="tdc-chip-text">+{chipDefs.length}</span>
                </span>
              </div>
            </div>

            {!schedDefault && !schedOpen ? (
              <button
                type="button"
                className="tdc-sum"
                onClick={() => setSchedOpen(true)}
                title="Scheduling"
              >
                <LuCalendarClock size={13} aria-hidden />
                <span className="tdc-sum-text">{schedSummary(t)}</span>
              </button>
            ) : null}

            <div
              className="tdc-body"
              onScroll={() => {
                if (pop?.key === "deadline") setPop(null);
              }}
            >
              {schedOpen ? (
                <section className="tdc-sched" aria-label="Scheduling">
                  <div className="tdc-sched-head">
                    <span className="tdc-label">
                      <LuCalendarClock size={13} aria-hidden />
                      Scheduling
                    </span>
                    <button
                      type="button"
                      className="nx-btn nx-btn-text nx-btn-sm"
                      onClick={() => setSchedOpen(false)}
                    >
                      Done
                    </button>
                  </div>
                  <div className="tdc-srow">
                    <span className="tdc-srow-label">Placement</span>
                    <span
                      className="tdc-seg"
                      role="group"
                      aria-label="Placement"
                    >
                      <button
                        type="button"
                        aria-pressed={!t.isFixed}
                        onClick={() => emit(fixedPatch(false))}
                      >
                        Auto
                      </button>
                      <button
                        type="button"
                        aria-pressed={t.isFixed}
                        onClick={() => emit(fixedPatch(true))}
                      >
                        Fixed
                      </button>
                    </span>
                    <span className="tdc-srow-hint">{placementHint(t)}</span>
                  </div>
                  <div className="tdc-srow">
                    <span className="tdc-srow-label">Min. work block</span>
                    <span className="tdc-pills">
                      {TD_CHUNK.map((c) => (
                        <button
                          key={String(c)}
                          type="button"
                          className="tdc-pill"
                          aria-pressed={chunkPressed(t, c)}
                          onClick={() => emit(chunkPatch(t, c))}
                        >
                          {c ? `${c} min` : "Don’t split"}
                        </button>
                      ))}
                    </span>
                  </div>
                  <div className="tdc-srow">
                    <span className="tdc-srow-label">Deadline</span>
                    <button
                      type="button"
                      data-tdc-trigger="deadline"
                      className={`tdc-chip${t.deadline ? "" : " is-empty"}`}
                      aria-expanded={pop?.key === "deadline"}
                      onClick={(e) => openPop("deadline", e.currentTarget)}
                    >
                      <LuCalendarClock size={13} aria-hidden />
                      <span className="tdc-chip-text">
                        {t.deadline
                          ? `${t.hardDeadline ? "Hard · " : ""}${tdDayName(t.deadline, today)}`
                          : "Deadline"}
                      </span>
                    </button>
                  </div>
                  {/* //todo Hours (work / personal / any → Task.scheduleId):
                      needs a work-schedules hook and query key from S1. */}
                </section>
              ) : null}

              <textarea
                ref={notesRef}
                className="tdc-notes"
                rows={1}
                value={notes}
                placeholder="Add notes"
                aria-label="Notes"
                onChange={(e) => editNotes(e.target.value)}
                onBlur={flush}
              />

              <section className="tdc-subs" aria-label="Subtasks">
                {tparts.length ? (
                  <div className="tdc-subs-head">
                    <span className="tdc-label">Subtasks</span>
                    <PartsRing done={closed} total={tparts.length} />
                  </div>
                ) : null}
                {tparts.map((p, i) => {
                  const dropCls =
                    drag && drag.over === i && drag.from !== i
                      ? drag.from < i
                        ? " is-drop-after"
                        : " is-drop-before"
                      : "";
                  return (
                    <div
                      key={p.id}
                      className={`tdc-sub${dropCls}${drag?.from === i ? " is-dragging" : ""}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(i));
                        setDrag({ from: i, over: i });
                      }}
                      onDragOver={(e) => {
                        if (!drag) return;
                        e.preventDefault();
                        if (drag.over !== i)
                          setDrag({ from: drag.from, over: i });
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!drag) return;
                        const f = drag.from;
                        setDrag(null);
                        if (f !== i) reorder(f, i);
                      }}
                      onDragEnd={() => setDrag(null)}
                    >
                      <span className="tdc-grip" aria-hidden="true">
                        <LuGripVertical size={13} />
                      </span>
                      <button
                        type="button"
                        className={`tdc-sub-check${p.done ? " is-on" : ""}${p.done && subTick === p.id ? " is-ticking" : ""}`}
                        role="checkbox"
                        aria-checked={p.done}
                        aria-label={p.done ? "Reopen subtask" : "Tick subtask"}
                        onClick={() => {
                          setSubTick(p.done ? null : p.id);
                          void parts.toggle(t.id, p).catch(() => undefined);
                        }}
                      >
                        {p.done ? <LuCheck size={11} aria-hidden /> : null}
                      </button>
                      <input
                        className={`tdc-sub-title${p.done ? " is-done" : ""}`}
                        value={partTitle(p.id, p.title)}
                        placeholder="Subtask"
                        aria-label="Subtask"
                        onChange={(e) => {
                          const v = e.target.value;
                          setPartText((m) => ({ ...m, [p.id]: v }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                            e.preventDefault();
                            e.currentTarget.blur();
                            addRef.current?.focus();
                          } else if (
                            e.key === "Backspace" &&
                            !partTitle(p.id, p.title)
                          ) {
                            e.preventDefault();
                            void parts
                              .remove(t.id, p.id)
                              .catch(() => undefined);
                          }
                        }}
                        onBlur={() => commitPart(p.id, p.title)}
                      />
                      <button
                        type="button"
                        className="tdc-icon-btn tdc-sub-del"
                        aria-label="Remove subtask"
                        onClick={() =>
                          void parts.remove(t.id, p.id).catch(() => undefined)
                        }
                      >
                        <LuX size={13} aria-hidden />
                      </button>
                    </div>
                  );
                })}
                <label className="tdc-sub tdc-sub-add">
                  <span className="tdc-grip" aria-hidden="true" />
                  <span className="tdc-sub-plus" aria-hidden="true">
                    <LuPlus size={14} />
                  </span>
                  <input
                    ref={addRef}
                    className="tdc-sub-title"
                    value={addText}
                    placeholder="Add subtask"
                    aria-label="Add subtask"
                    onChange={(e) => setAddText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && addText.trim()) {
                        e.preventDefault();
                        void parts
                          .add(t.id, addText.trim(), tparts.length)
                          .catch(() => undefined);
                        setAddText("");
                      }
                    }}
                  />
                </label>
              </section>

              <div className="tdc-step" data-tdc-step="">
                <span className="tdc-step-arrow" aria-hidden="true">
                  <LuArrowRight size={14} />
                </span>
                <label className="tdc-step-label" htmlFor="tdc-entry">
                  First step
                </label>
                <input
                  id="tdc-entry"
                  className="tdc-step-input"
                  value={entry}
                  placeholder={
                    firstOpen?.title ||
                    "The smallest thing that counts as starting"
                  }
                  aria-label="First step"
                  onChange={(e) => editEntry(e.target.value)}
                  onBlur={flush}
                />
                {/* //todo "Start focus" on the first step: the Focus window
                    (S4) has no way yet to take an intention and a task. */}
                <span className="tdc-step-cost">2 min</span>
              </div>
              {/* //todo Attachments: TaskAttachment exists (M2) but has no
                  route; the Attach button and file chips wait for it. */}
            </div>

            <footer className="tdc-foot">
              <span className="tdc-meta">
                {/* //todo "Created 4 Sep": V3Task carries no createdAt. */}
                {updated ? `Updated ${updated}` : "Changes save as you type"}
              </span>
              <span
                className="tdc-saved"
                data-on={flash ? "1" : "0"}
                aria-live="polite"
              >
                <LuCheck size={12} aria-hidden />
                Saved
              </span>
            </footer>

            {pop && popBody ? (
              <div
                ref={popRef}
                className={`tdc-pop is-${pop.key}`}
                role="dialog"
                aria-label={pop.key}
                style={
                  {
                    "--tdc-x": `${pop.x}px`,
                    "--tdc-y": `${pop.y}px`,
                  } as CSSProperties
                }
              >
                {popBody}
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The ring + "1/3" (the task row's part counter, $P TdRing). */
function PartsRing({ done, total }: { done: number; total: number }) {
  const r = 6;
  const c = 2 * Math.PI * r;
  return (
    <span className="tk-count tdc-count">
      <svg
        className="tk-ring"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <circle className="tk-ring-track" cx="8" cy="8" r={r} />
        <circle
          className="tk-ring-fill"
          cx="8"
          cy="8"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={total ? c * (1 - done / total) : c}
        />
      </svg>
      {done}/{total}
    </span>
  );
}
