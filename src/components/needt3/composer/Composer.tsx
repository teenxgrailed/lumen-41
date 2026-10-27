"use client";

/* THE COMPOSER — one line that makes anything (prototype Composer.jsx).
 *
 * Creating is a hurry and editing is a sit-down, so they are different
 * objects: this is the hurry. You type a sentence, the line shows what was
 * understood inside the sentence itself (the underlay), the chips restate it,
 * and Enter commits. The sheet stays open after a create, because nobody
 * captures exactly one thing.
 *
 * Every picker writes words into the line rather than setting a hidden field,
 * so the sentence stays the one source of truth and the parse reports a pick
 * like anything typed.
 *
 * Not ported: dictation (the prototype's drafts come from a fixture) and the
 * Attachment and Labels shelf rows (a task has no label column and the
 * create route takes no files yet).
 */
import {
  type ComponentType,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import * as Dialog from "@radix-ui/react-dialog";
import {
  LuAlarmClock,
  LuAlignLeft,
  LuArrowRight,
  LuCalendar,
  LuCalendarClock,
  LuCalendarDays,
  LuCheck,
  LuCircleCheck,
  LuClock,
  LuEllipsis,
  LuFileText,
  LuFlag,
  LuFolder,
  LuHourglass,
  LuLayoutTemplate,
  LuListPlus,
  LuMapPin,
  LuMaximize2,
  LuRepeat,
  LuSun,
  LuSunrise,
  LuX,
} from "react-icons/lu";

import { newDate, toLocalDateKey } from "@/lib/date-utils";
import { BUILTIN_TEMPLATES } from "@/lib/needt3/builtin-templates";
import { dayLabel } from "@/lib/needt3/derive";
import {
  useCreateDoc,
  useTemplates,
  useUpdateDoc,
} from "@/lib/needt3/hooks/docs";
import { useCalendars, useCreateEvent } from "@/lib/needt3/hooks/events";
import { useCreateHabit } from "@/lib/needt3/hooks/habits";
import {
  useCreateFromBuiltin,
  useCreateFromTemplate,
} from "@/lib/needt3/hooks/places";
import { useProjects } from "@/lib/needt3/hooks/projects";
import {
  type ReminderSpec,
  useReminderActions,
} from "@/lib/needt3/hooks/reminders";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { useCreateTask, useTaskParts } from "@/lib/needt3/hooks/tasks";
import type { V3Project } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

import { useNeedt3Ui } from "@/store/needt3-ui";

import strings from "../../../../docs/port/prototype/port/strings/en.json";
import { useV3PortalContainer } from "../ctx/PortalScope";
import { useExit } from "../ctx/useExit";
import { Tooltip } from "../menu/Tooltip";
import { templatePageTitle } from "../places/derive";
import { ReminderPicker, specLabel } from "../task/ReminderPicker";
import {
  type CoFacetKind,
  type CoKind,
  type CoMark,
  type ComposerFacet,
  type ComposerParse,
  clockWords,
  composerDraft,
  composerParse,
  lengthLabel,
  pickEnd,
  pickFacet,
  rangeWords,
  readsFacet,
  scopeParse,
  stripFacet,
} from "./parse";

const S = strings["Composer.jsx"];
const T = S.Composer;

type Icon = ComponentType<{ size?: number }>;

/** The verdict's segment. A habit is never a segment: "every day" says it. */
const KINDS: Record<CoKind, { label: string; Icon: Icon }> = {
  task: { label: S.CO_TYPES.task, Icon: LuCircleCheck },
  event: { label: S.CO_TYPES.event, Icon: LuCalendar },
  doc: { label: T.doc, Icon: LuFileText },
  habit: { label: S.CO_TYPES.habit, Icon: LuRepeat },
};
const SEGMENTS: CoKind[] = ["task", "event", "doc"];

const ACCENT = "var(--accent)";
const TONE: Record<CoFacetKind, string> = {
  repeat: "var(--info)",
  deadline: "var(--destructive)",
  duration: "var(--text-tertiary)",
  date: ACCENT,
  time: ACCENT,
  priority: "var(--destructive)",
  project: ACCENT,
  label: "var(--success)",
};

/** The facets a footer picker can set. */
type PickKind =
  | "date"
  | "time"
  | "end"
  | "duration"
  | "priority"
  | "project"
  | "calendar"
  | "template";

/** Pickers that set state beside the line, or write more than one facet. */
type StatePick = "calendar" | "template" | "end";

interface PickRow {
  label: string;
  Icon: Icon;
  words: string;
  tone?: string;
}

const PICK: Record<
  Exclude<PickKind, "project" | StatePick>,
  (PickRow | null)[]
> = {
  date: [
    { label: "Today", Icon: LuSun, words: "today" },
    { label: "Tomorrow", Icon: LuSunrise, words: "tomorrow" },
    { label: "This weekend", Icon: LuCalendarDays, words: "this weekend" },
    { label: "Next week", Icon: LuArrowRight, words: "next week" },
    null,
    { label: "Monday", Icon: LuCalendar, words: "monday" },
    { label: "Friday", Icon: LuCalendar, words: "friday" },
  ],
  time: ["9am", "10am", "12pm", "2pm", "3pm", "5pm"].map((w) => ({
    label: w,
    Icon: LuClock,
    words: w,
  })),
  duration: ["15 min", "30 min", "45 min", "1 h", "2 h"].map((w) => ({
    label: w,
    Icon: LuClock,
    words: w,
  })),
  priority: ["Urgent", "Important", "Whenever"].map((w) => ({
    label: w,
    Icon: LuFlag,
    words: w.toLowerCase(),
  })),
};

const PICK_TITLE: Record<PickKind, string> = {
  time: "Start time",
  end: "End time",
  calendar: "Calendar",
  template: "Template",
  date: S.CO_PICK.date,
  duration: S.CO_PICK.duration,
  priority: S.CO_PICK.priority,
  project: S.CO_PICK.project,
};

/* Everything the line does not parse, opening upward so the line you are
   typing in never moves. `null` words = the description line. */
const MORE: {
  label: string;
  Icon: Icon;
  tone: string;
  words: string | null;
}[] = [
  {
    label: "Description",
    Icon: LuAlignLeft,
    tone: "var(--text-tertiary)",
    words: null,
  },
  {
    label: "Subtasks",
    Icon: LuListPlus,
    tone: "var(--text-tertiary)",
    words: "/",
  },
  {
    label: "Duration",
    Icon: LuClock,
    tone: "var(--text-tertiary)",
    words: "for 30 min",
  },
  {
    label: "Priority",
    Icon: LuFlag,
    tone: "var(--destructive)",
    words: "urgent",
  },
  {
    label: "Deadline",
    Icon: LuCalendarClock,
    tone: "var(--destructive)",
    words: "by friday",
  },
  { label: "Repeat", Icon: LuRepeat, tone: ACCENT, words: "every day" },
];

/** "4:30 pm" for minutes from midnight. */
function clock12(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
}

/** What each type is called in the line, its name field and its button. */
const COPY: Record<CoKind, { placeholder: string; field: string; go: string }> =
  {
    task: { placeholder: T.new_task, field: T.task_name, go: T.add_task },
    event: { placeholder: "New event", field: "Event name", go: T.add_event },
    doc: { placeholder: "Untitled doc", field: "Doc title", go: "Create doc" },
    habit: { placeholder: "New habit", field: "Habit name", go: T.add_habit },
  };

/** The prototype's flight runs 460 ms; snapped to the scale (MOTION V-D17). */
const FLIGHT_MS = 280;

function hueOf(project: { color: string | null } | null | undefined) {
  return project?.color ?? ACCENT;
}

/* THE UNDERLAY. The input's own text is transparent; this draws the same
   string underneath with the claimed runs marked. It shares the input's
   metrics and scroll position, so the marks sit under the letters. */
function Underlay({
  text,
  marks,
  scroll,
  projectHue,
}: {
  text: string;
  marks: readonly CoMark[];
  scroll: number;
  projectHue: string;
}) {
  const out: ReactNode[] = [];
  let at = 0;
  marks.forEach(({ from, to, kind }, i) => {
    if (from > at) out.push(<span key={`p${i}`}>{text.slice(at, from)}</span>);
    const tone = kind === "project" ? projectHue : TONE[kind];
    out.push(
      <span
        className="shell-underlay-span"
        key={`m${i}`}
        style={{
          boxShadow: `inset 0 -2px 0 0 color-mix(in oklab, ${tone} 55%, transparent)`,
          background: `color-mix(in oklab, ${tone} 12%, transparent)`,
        }}
      >
        {text.slice(from, to)}
      </span>
    );
    at = to;
  });
  const tail = text.slice(at);
  const slash = tail.indexOf("/");
  if (slash >= 0) {
    out.push(<span key="t">{tail.slice(0, slash)}</span>);
    out.push(
      <span className="shell-underlay-span-2" key="parts">
        {tail.slice(slash)}
      </span>
    );
  } else if (tail) out.push(<span key="t">{tail}</span>);
  return (
    <div
      aria-hidden="true"
      className="co-mirror"
      style={{ transform: `translateX(${-scroll}px)` }}
    >
      {out}
    </div>
  );
}

function Chip({
  tone,
  Glyph,
  quiet,
  onClear,
  children,
}: {
  tone: string;
  Glyph: Icon;
  quiet?: boolean;
  onClear?: () => void;
  children: ReactNode;
}) {
  return (
    <span className={`cmp-chip${quiet ? " is-quiet" : ""}`}>
      <span
        className="shell-chip-grid"
        aria-hidden="true"
        style={{ color: tone }}
      >
        <Glyph size={13} />
      </span>
      <span>{children}</span>
      {onClear ? (
        <button
          type="button"
          className="cmp-chip-x"
          onClick={onClear}
          aria-label={S.CoChip.remove}
        >
          <LuX size={11} />
        </button>
      ) : null}
    </span>
  );
}

function PickMenu({
  open,
  kind,
  rows,
  current,
  onPick,
  onClear,
}: {
  open: boolean;
  kind: PickKind;
  rows: (PickRow | null)[];
  current: string | null;
  onPick: (words: string) => void;
  onClear: () => void;
}) {
  // nx-pop exits in 130 ms; the prototype's 120 cut its last frames (V-D18).
  const [shown, leaving] = useExit(open, 130);
  if (!shown) return null;
  const title = PICK_TITLE[kind];
  return (
    <div
      role="menu"
      aria-label={title}
      className={`cmp-menu nx-pop${leaving ? " is-leaving" : ""}`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="cmp-menu-title">{title}</div>
      {rows.map((r, i) =>
        r == null ? (
          <span key={`s${i}`} className="cmp-sep" />
        ) : (
          <button
            key={r.label}
            type="button"
            role="menuitem"
            className="cmp-row"
            onClick={() => onPick(r.words)}
          >
            <span
              className="shell-chip-grid"
              aria-hidden="true"
              style={{
                color: r.tone
                  ? r.tone
                  : kind === "priority"
                    ? "var(--destructive)"
                    : "var(--text-tertiary)",
              }}
            >
              <r.Icon size={14} />
            </span>
            {r.label}
            {current && current.toLowerCase() === r.label.toLowerCase() ? (
              <span className="cmp-hint">
                <LuCheck size={13} />
              </span>
            ) : null}
          </button>
        )
      )}
      {current ? (
        <>
          <span className="cmp-sep" />
          <button
            type="button"
            role="menuitem"
            className="cmp-row shell-menu2-row"
            onClick={onClear}
          >
            <span className="shell-menu2-grid" aria-hidden="true">
              <LuX size={14} />
            </span>
            {S.CoMenu2.no} {title.toLowerCase()}
          </button>
        </>
      ) : null}
    </div>
  );
}

function Shelf({
  open,
  withNote,
  onPick,
  onRemind,
}: {
  open: boolean;
  /** Only a task keeps a description; elsewhere the row would be dropped. */
  withNote: boolean;
  onPick: (words: string | null) => void;
  /** A task can be given a reminder before it exists. */
  onRemind?: () => void;
}) {
  return (
    <div
      className={`co-shelf${open ? " is-open" : ""}`}
      aria-hidden={open ? undefined : "true"}
    >
      <div className="co-shelf-inner">
        <div className="co-shelf-body">
          <div className="shell-shelf-grid">
            {MORE.filter((row) => withNote || row.words != null).map((row) => (
              <button
                key={row.label}
                type="button"
                tabIndex={open ? 0 : -1}
                className="cmp-row shell-shelf-row"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => onPick(row.words)}
              >
                <span
                  className="shell-shelf-grid-2"
                  aria-hidden="true"
                  style={{ color: row.tone }}
                >
                  <row.Icon size={14} />
                </span>
                <span className="shell-nf-card-span">{row.label}</span>
              </button>
            ))}
            {onRemind ? (
              <button
                type="button"
                tabIndex={open ? 0 : -1}
                className="cmp-row shell-shelf-row"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={onRemind}
              >
                <span
                  className="shell-shelf-grid-2"
                  aria-hidden="true"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <LuAlarmClock size={14} />
                </span>
                <span className="shell-nf-card-span">Remind me…</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** What the sentence was understood to say, as chips (label order fixed). */
function chipsOf(p: ComposerParse, kind: CoKind) {
  const chips: {
    key: string;
    Glyph: Icon;
    tone: string;
    label: string;
    facet: ComposerFacet | null;
  }[] = [];
  const add = (
    key: string,
    Glyph: Icon,
    tone: string,
    facet: ComposerFacet | null
  ) => {
    if (facet && readsFacet(kind, key as CoFacetKind))
      chips.push({ key, Glyph, tone, label: facet.label, facet });
  };
  add("date", LuCalendar, ACCENT, p.date);
  add("time", LuClock, ACCENT, p.time);
  add("duration", LuHourglass, "var(--text-tertiary)", p.duration);
  add("deadline", LuCalendarClock, "var(--destructive)", p.deadline);
  add("repeat", LuRepeat, "var(--info)", p.repeat);
  add("priority", LuFlag, "var(--destructive)", p.priority);
  add("project", LuFolder, hueOf(p.project), p.project);
  if (p.parts.length && readsFacet(kind, "label"))
    chips.push({
      key: "parts",
      Glyph: LuListPlus,
      tone: "var(--text-tertiary)",
      label: `${p.parts.length} ${p.parts.length === 1 ? "subtask" : "subtasks"}`,
      facet: null,
    });
  return chips;
}

export interface ComposerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The New task sheet: a type switch, the sentence in the title size, chips
 * for what it was understood to say, and a footer of pickers for what it did
 * not. Opened by `N`, Create → New task and the app menu (store
 * `composerOpen`); creates through the v3 hooks with an Undo notice.
 */
export function Composer({ open, onClose }: ComposerProps) {
  const container = useV3PortalContainer();
  const [shown, leaving] = useExit(open, 170);
  const [text, setText] = useState("");
  const [scroll, setScroll] = useState(0);
  const [more, setMore] = useState(false);
  /* A reminder chosen before the task exists; set once it is created. */
  const [remind, setRemind] = useState<ReminderSpec | null>(null);
  const [remindPick, setRemindPick] = useState(false);
  const reminderActions = useReminderActions();
  const [menu, setMenu] = useState<PickKind | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [type, setType] = useState<CoKind | null>(null);
  /* Per-type fields. They live beside the line, not in it: a doc has no
     "tomorrow" and an event's place is not a facet of the sentence. */
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [docProject, setDocProject] = useState<string | null>(null);
  const [template, setTemplate] = useState<string | null>(null);
  const [flight, setFlight] = useState<{ title: string; key: number } | null>(
    null
  );
  const input = useRef<HTMLInputElement>(null);
  const foot = useRef<HTMLDivElement>(null);

  const router = useRouter();
  const { data: projects = [] } = useProjects();
  const createTask = useCreateTask();
  const parts = useTaskParts();
  const createDoc = useCreateDoc();
  const createHabit = useCreateHabit();
  const createEvent = useCreateEvent();
  const updateDoc = useUpdateDoc();
  const zone = useTimeZone();
  const fromBuiltin = useCreateFromBuiltin();
  const fromSaved = useCreateFromTemplate();
  const { data: feeds = [] } = useCalendars();
  const { data: saved = [] } = useTemplates();

  const said = useMemo(
    () => composerParse(text, newDate(), projects),
    [text, projects]
  );
  const kind = type ?? said.kind;
  /* The sentence read as the chosen type: only a task or an event reads days
     and clocks, so a doc title keeps them as words. */
  const p = useMemo(() => scopeParse(said, kind), [said, kind]);
  /* v3 writes only into Needt (LOCAL) calendars; synced ones are read-only. */
  const calendars = useMemo(
    () => feeds.filter((f) => f.type === "LOCAL" && f.enabled !== false),
    [feeds]
  );
  const templateName =
    BUILTIN_TEMPLATES.find((b) => b.id === template)?.title ??
    saved.find((t) => t.id === template)?.name ??
    null;
  const calendar =
    calendars.find((f) => f.id === calendarId) ?? calendars[0] ?? null;

  useEffect(() => {
    if (!open) {
      setMenu(null);
      setMore(false);
      setRemind(null);
      setRemindPick(false);
      return;
    }
    setText("");
    setScroll(0);
    setType(null);
    setNote(null);
    setLocation("");
    setDocProject(null);
    setTemplate(null);
    setCalendarId(null);
  }, [open]);

  /* A picker closes on any press outside the footer. */
  useEffect(() => {
    if (!menu) return undefined;
    const away = (e: MouseEvent) => {
      if (foot.current?.contains(e.target as Node)) return;
      setMenu(null);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [menu]);

  useEffect(() => {
    if (!flight) return undefined;
    const t = window.setTimeout(() => setFlight(null), FLIGHT_MS);
    return () => window.clearTimeout(t);
  }, [flight]);

  const refocus = () => window.setTimeout(() => input.current?.focus(), 20);

  function edit(next: (t: string) => string) {
    setMenu(null);
    setText(next);
    refocus();
  }

  const facetOf = (k: Exclude<PickKind, StatePick>): ComposerFacet | null =>
    p[k];

  /** Makes what the line said; for a task, its id (so it can be opened). */
  async function create(
    parse: ComposerParse,
    as: CoKind,
    said: string | null
  ): Promise<string | null> {
    const draft = composerDraft(parse, newDate(), as, said);
    const undoable = (msg: string, undo: () => Promise<void>) =>
      notify.success(msg, {
        action: { label: "Undo", onClick: () => void undo() },
      });
    try {
      if (draft.kind === "doc") {
        const projectId = docProject;
        const title = draft.doc.title || undefined;
        /* A template with no title is named as the Templates screen names it. */
        const named =
          title ?? templatePageTitle(templateName ?? "", newDate(), zone);
        const made = template
          ? template.startsWith("builtin:")
            ? await fromBuiltin.mutateAsync({
                builtinId: template,
                title: named,
              })
            : await fromSaved.mutateAsync({
                templateId: template,
                title: named,
              })
          : await createDoc.mutateAsync({ draft: { title, projectId } });
        if (!made.result) return null;
        if (template && projectId)
          await updateDoc.mutateAsync({
            id: made.result.id,
            patch: { projectId },
          });
        undoable("Doc created", made.undo);
        return made.result.id;
      } else if (draft.kind === "habit") {
        const { undo } = await createHabit.mutateAsync({ draft: draft.habit });
        undoable("Habit added", undo);
      } else if (draft.kind === "event") {
        const { undo } = await createEvent({
          ...draft.event,
          calendarId: calendar?.id ?? null,
          location: location.trim() || null,
        });
        undoable("Added to Calendar", undo);
      } else {
        const { result, undo } = await createTask.mutateAsync({
          draft: draft.task,
        });
        const day = draft.task.dueDate ?? null;
        /* The task exists: offer Undo now, so a failed part below can
           neither lose it nor tempt a retry into a duplicate task. */
        undoable(
          !day || day === toLocalDateKey(newDate())
            ? "Added to today"
            : `Added — ${dayLabel(day)}`,
          undo
        );
        if (result) {
          try {
            for (const [i, title] of draft.parts.entries())
              await parts.add(result.id, title, i);
          } catch {
            // The parts hook has told the person; the task stays.
          }
          if (remind) {
            // The actions hook tells the person if it fails; the task stays.
            await reminderActions.create({ taskId: result.id }, remind);
            setRemind(null);
          }
          return result.id;
        }
      }
    } catch {
      // The hook has already told the person and put the cache back.
    }
    return null;
  }

  /** Enter adds and stays; ⌘↵ (or the expand button) adds a task and opens it in full. */
  function commit(openAfter = false) {
    const line = text.trim();
    const as = type ?? said.kind;
    /* A doc may be made untitled; the others need words. */
    if (!line && as !== "doc") return;
    const parse = scopeParse(composerParse(line, newDate(), projects), as);
    const made = create(parse, as, note);
    if (as === "doc") {
      /* A doc opens once it exists; a failure leaves the sheet as it was. */
      void made.then((id) => {
        if (!id) return;
        router.push(`/pages/${encodeURIComponent(id)}`);
        onClose();
      });
      return;
    }
    if (openAfter && as === "task") {
      void made.then((id) => {
        if (id) router.push(`/tasks?task=${encodeURIComponent(id)}`);
      });
      setText("");
      setType(null);
      setNote(null);
      setMenu(null);
      onClose();
      return;
    }
    /* What was made lifts off the sheet and fades upward; the sheet stays.
       Under reduced motion nothing flies. */
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
      setFlight({ title: parse.title, key: newDate().getTime() });
    setText("");
    setScroll(0);
    setType(null);
    setNote(null);
    setLocation("");
    setMenu(null);
    input.current?.focus();
  }

  /** Switch the type; the typed words stay (⌘1/2/3, the tabs, arrows). */
  function selectKind(k: CoKind, focus = true) {
    setType(k === said.kind ? null : k);
    setMenu(null);
    setMore(false);
    if (focus) refocus();
  }

  if (!shown || !container) return null;
  const out = leaving ? " is-leaving" : "";
  const chips = chipsOf(p, kind);
  const assumeToday =
    (kind === "task" || kind === "habit" || kind === "event") &&
    !p.date &&
    !p.repeat &&
    !!text.trim();

  /** A picker whose choice is state beside the line, not words in it. */
  interface Custom {
    value: string | null;
    rows: PickRow[];
    onPick: (id: string) => void;
    onClear: () => void;
  }
  /* The end of an Event: picked as a length from its start, written back into
     the line as a range ("15:00-16:00") so the sentence stays the one truth. */
  const startAt = p.time?.minutes ?? 9 * 60;
  const endPick: Custom = {
    value: p.end ? clock12(p.end.minutes) : null,
    rows: [30, 60, 90, 120, 180]
      .filter((o) => startAt + o < 24 * 60)
      .map(
        (o): PickRow => ({
          label: `${clock12(startAt + o)} · ${lengthLabel(o)}`,
          Icon: LuClock,
          words: String(startAt + o),
        })
      ),
    onPick: (words) => edit((t) => pickEnd(t, p, Number(words))),
    onClear: () =>
      edit((t) => pickFacet(t, p.time, p.time ? clockWords(startAt) : "")),
  };
  /* With a range in the line, the Time button moves it, keeping its length. */
  const startPick: Custom | undefined = p.end
    ? {
        value: clock12(startAt),
        rows: PICK.time.filter((r): r is PickRow => r != null),
        onPick: (words) => {
          const at = composerParse(words, newDate()).time?.minutes;
          if (at == null || !p.end) return;
          const len = p.end.minutes - startAt;
          edit((t) =>
            pickFacet(
              t,
              p.time,
              rangeWords(at, Math.min(at + len, 24 * 60 - 1))
            )
          );
        },
        onClear: () => edit((t) => stripFacet(t, p.time)),
      }
    : undefined;
  const footBtn = (
    k: PickKind,
    Glyph: Icon,
    label: string,
    tone: string,
    custom?: Custom
  ) => {
    const word = k === "calendar" || k === "template" || k === "end" ? null : k;
    const value = custom
      ? custom.value
      : word
        ? (facetOf(word)?.label ?? null)
        : null;
    const rows = custom
      ? custom.rows
      : k === "project"
        ? projects.map(
            (pr: V3Project): PickRow => ({
              label: pr.name,
              Icon: LuFolder,
              words: pr.name,
              tone: hueOf(pr),
            })
          )
        : PICK[k as Exclude<PickKind, "project" | StatePick>];
    return (
      <span className="shell-mini-month-div">
        <button
          type="button"
          className={`cmp-btn${menu === k ? " is-open" : ""}${value ? " is-set" : ""}`}
          aria-haspopup="menu"
          aria-expanded={menu === k}
          onClick={() => {
            setMore(false);
            setMenu(menu === k ? null : k);
          }}
        >
          <span
            className="shell-chip-grid"
            aria-hidden="true"
            style={{ color: value ? tone : "var(--text-tertiary)" }}
          >
            <Glyph size={14} />
          </span>
          {value ?? label}
        </button>
        <PickMenu
          open={menu === k}
          kind={k}
          rows={rows}
          current={value}
          onPick={(words) =>
            custom
              ? (setMenu(null), custom.onPick(words), refocus())
              : word && edit((t) => pickFacet(t, facetOf(word), words))
          }
          onClear={() =>
            custom
              ? (setMenu(null), custom.onClear(), refocus())
              : word && edit((t) => stripFacet(t, facetOf(word)))
          }
        />
      </span>
    );
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal container={container} forceMount>
        <Dialog.Overlay className={`cmp-scrim nx-scrim${out}`} forceMount>
          <Dialog.Content
            className={`cmp-sheet nx-sheet${out}`}
            forceMount
            aria-describedby={undefined}
            onKeyDown={(e) => {
              /* ⌘1 / ⌘2 / ⌘3 pick Task / Event / Doc from anywhere in the sheet. */
              if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
              const at = Number(e.key) - 1;
              if (!Number.isInteger(at) || at < 0 || at >= SEGMENTS.length)
                return;
              e.preventDefault();
              e.stopPropagation();
              selectKind(SEGMENTS[at]);
            }}
            onInteractOutside={(e) => {
              /* Undo on a notice is outside the sheet (press and focus) but
                 must not close it: the person is still capturing. */
              const target = e.detail.originalEvent.target;
              if (target instanceof Element && target.closest(".nf-stack"))
                e.preventDefault();
            }}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              input.current?.focus();
            }}
            onEscapeKeyDown={(e) => {
              /* Esc closes one thing: a picker or the shelf first, then an
                 empty description, then the sheet. */
              if (menu || more) {
                e.preventDefault();
                setMenu(null);
                setMore(false);
                return;
              }
              if (note != null && !note.trim()) {
                e.preventDefault();
                setNote(null);
                refocus();
              }
            }}
          >
            <Dialog.Title className="sr-only">
              {COPY[kind].placeholder}
            </Dialog.Title>
            {flight ? (
              <span key={flight.key} className="co-flight">
                {flight.title}
              </span>
            ) : null}
            <div className="cmp-body">
              <div className="base-row">
                <div className="cmp-seg" role="tablist" aria-label={T.kind}>
                  {SEGMENTS.map((k, at) => {
                    const { Icon: Glyph, label } = KINDS[k];
                    const roving = SEGMENTS.includes(kind)
                      ? kind === k
                      : at === 0;
                    return (
                      <button
                        key={k}
                        type="button"
                        role="tab"
                        aria-selected={kind === k}
                        aria-keyshortcuts={`Meta+${at + 1} Control+${at + 1}`}
                        tabIndex={roving ? 0 : -1}
                        className={kind === k ? "is-on" : ""}
                        onClick={() => selectKind(k)}
                        onKeyDown={(e) => {
                          const step =
                            e.key === "ArrowRight"
                              ? 1
                              : e.key === "ArrowLeft"
                                ? -1
                                : 0;
                          if (!step || e.metaKey || e.ctrlKey || e.altKey)
                            return;
                          e.preventDefault();
                          const to =
                            (at + step + SEGMENTS.length) % SEGMENTS.length;
                          selectKind(SEGMENTS[to], false);
                          e.currentTarget.parentElement
                            ?.querySelectorAll<HTMLElement>('[role="tab"]')
                            [to]?.focus();
                        }}
                      >
                        <Glyph size={13} />
                        {label}
                      </button>
                    );
                  })}
                </div>
                {kind === "habit" && p.repeat ? (
                  <span className="shell-composer-text">
                    {T.habit_from}
                    {p.repeat.label}&rdquo;
                  </span>
                ) : null}
                {!type && text.trim() && kind !== "habit" ? (
                  <span className="shell-composer-text-2">inferred</span>
                ) : null}
              </div>

              <div className="co-line">
                <Underlay
                  text={text}
                  marks={p.marks}
                  scroll={scroll}
                  projectHue={hueOf(p.project)}
                />
                <input
                  ref={input}
                  className="co-input"
                  value={text}
                  spellCheck={false}
                  aria-label={COPY[kind].field}
                  placeholder={COPY[kind].placeholder}
                  onChange={(e) => {
                    setText(e.target.value);
                    setScroll(e.target.scrollLeft);
                  }}
                  onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      if (e.nativeEvent.isComposing) return;
                      e.preventDefault();
                      commit(e.metaKey || e.ctrlKey);
                    }
                  }}
                />
              </div>

              {/* The description: a second line — prose, not an attribute. */}
              {note != null && kind === "task" ? (
                <div className="co-note shell-composer-note">
                  <textarea
                    className="shell-composer-textarea"
                    autoFocus
                    value={note}
                    rows={2}
                    spellCheck={false}
                    placeholder={T.description}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <button
                    type="button"
                    className="cmp-btn cmp-icon"
                    aria-label={T.drop_the_description}
                    onClick={() => {
                      setNote(null);
                      refocus();
                    }}
                  >
                    <LuX size={13} />
                  </button>
                </div>
              ) : null}

              {/* An event's place: its own field, not a word in the sentence. */}
              {kind === "event" ? (
                <div className="co-note shell-composer-note">
                  <LuMapPin size={14} aria-hidden="true" />
                  <input
                    className="shell-composer-textarea"
                    value={location}
                    spellCheck={false}
                    aria-label="Location"
                    placeholder="Location"
                    onChange={(e) => setLocation(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        commit();
                      }
                    }}
                  />
                </div>
              ) : null}

              {/* What the sentence was understood to say. What the app
                  assumes (the day) is a quiet outline, not a chip. */}
              {chips.length || assumeToday ? (
                <div className="cmp-chips">
                  {chips.map((c) => (
                    <Chip
                      key={c.key + c.label}
                      tone={c.tone}
                      Glyph={c.Glyph}
                      onClear={() =>
                        edit((t) =>
                          c.facet
                            ? stripFacet(t, c.facet)
                            : t.split("/")[0].replace(/\s+$/, "")
                        )
                      }
                    >
                      {c.label}
                    </Chip>
                  ))}
                  {assumeToday ? (
                    <Chip
                      quiet
                      tone="var(--text-quaternary)"
                      Glyph={LuCalendar}
                    >
                      {T.today}
                    </Chip>
                  ) : null}
                </div>
              ) : null}

              {remindPick && kind === "task" ? (
                <ReminderPicker
                  onPick={(spec) => {
                    setRemind(spec);
                    setRemindPick(false);
                  }}
                />
              ) : null}
              {remind && kind === "task" ? (
                <div className="cmp-remind">
                  <Chip quiet tone="var(--text-secondary)" Glyph={LuAlarmClock}>
                    {specLabel(remind)}
                  </Chip>
                  <button
                    type="button"
                    className="rmd-remove"
                    aria-label="Remove the reminder"
                    onClick={() => setRemind(null)}
                  >
                    <LuX size={13} aria-hidden />
                  </button>
                </div>
              ) : null}
              <Shelf
                open={more}
                withNote={kind === "task"}
                onRemind={
                  kind === "task"
                    ? () => {
                        setMore(false);
                        setRemindPick(true);
                      }
                    : undefined
                }
                onPick={(words) => {
                  setMore(false);
                  if (words == null) {
                    setNote((n) => n ?? "");
                    return;
                  }
                  edit((t) =>
                    t ? `${t.replace(/\s+$/, "")} ${words}` : words
                  );
                }}
              />
            </div>

            <div className="cmp-foot" ref={foot}>
              {kind === "event" ? (
                <>
                  {footBtn("date", LuCalendar, T.date, ACCENT)}
                  {footBtn("time", LuClock, "Time", ACCENT, startPick)}
                  {footBtn("end", LuClock, "End", ACCENT, endPick)}
                  {footBtn(
                    "duration",
                    LuHourglass,
                    T.duration,
                    "var(--text-secondary)"
                  )}
                  {footBtn(
                    "calendar",
                    LuCalendarDays,
                    "Calendar",
                    "var(--text-secondary)",
                    {
                      value: calendar?.name ?? null,
                      rows: calendars.map(
                        (f): PickRow => ({
                          label: f.name,
                          Icon: LuCalendarDays,
                          words: f.id,
                          tone: f.color ?? ACCENT,
                        })
                      ),
                      onPick: setCalendarId,
                      onClear: () => setCalendarId(null),
                    }
                  )}
                </>
              ) : kind === "doc" ? (
                <>
                  {footBtn("project", LuFolder, T.project, ACCENT, {
                    value:
                      projects.find((pr) => pr.id === docProject)?.name ?? null,
                    rows: projects.map(
                      (pr: V3Project): PickRow => ({
                        label: pr.name,
                        Icon: LuFolder,
                        words: pr.id,
                        tone: hueOf(pr),
                      })
                    ),
                    onPick: setDocProject,
                    onClear: () => setDocProject(null),
                  })}
                  {footBtn(
                    "template",
                    LuLayoutTemplate,
                    "Template",
                    "var(--text-secondary)",
                    {
                      value: templateName,
                      rows: [
                        ...BUILTIN_TEMPLATES.map(
                          (b): PickRow => ({
                            label: b.title,
                            Icon: LuLayoutTemplate,
                            words: b.id,
                          })
                        ),
                        ...saved.map(
                          (t): PickRow => ({
                            label: t.name,
                            Icon: LuLayoutTemplate,
                            words: t.id,
                          })
                        ),
                      ],
                      onPick: setTemplate,
                      onClear: () => setTemplate(null),
                    }
                  )}
                </>
              ) : (
                <>
                  {footBtn("date", LuCalendar, T.date, ACCENT)}
                  {footBtn(
                    "duration",
                    LuClock,
                    T.duration,
                    "var(--text-secondary)"
                  )}
                  {footBtn("project", LuFolder, T.project, hueOf(p.project))}
                  {footBtn(
                    "priority",
                    LuFlag,
                    T.priority,
                    "var(--destructive)"
                  )}
                  <Tooltip label={T.more} side="top">
                    <button
                      type="button"
                      className={`cmp-btn cmp-icon${more ? " is-open" : ""}`}
                      aria-label={T.more}
                      aria-expanded={more}
                      onClick={() => {
                        setMenu(null);
                        setMore(!more);
                      }}
                    >
                      <LuEllipsis size={15} />
                    </button>
                  </Tooltip>
                </>
              )}
              <span className="shell-composer-row-2">
                {kind === "task" ? (
                  <Tooltip label="Open as a full task · ⌘↵" side="top">
                    <button
                      type="button"
                      className="cmp-btn cmp-icon"
                      aria-label="Open as a full task"
                      disabled={!text.trim()}
                      onClick={() => commit(true)}
                    >
                      <LuMaximize2 size={15} />
                    </button>
                  </Tooltip>
                ) : null}
                <button
                  type="button"
                  className="nx-btn nx-btn-text"
                  onClick={onClose}
                >
                  {T.cancel}
                </button>
                <button
                  type="button"
                  className="nx-btn nx-btn-primary cmp-go"
                  disabled={!text.trim() && kind !== "doc"}
                  onClick={() => commit()}
                >
                  {COPY[kind].go}
                  <kbd className="cmp-kbd" aria-hidden="true">
                    ↵
                  </kbd>
                </button>
              </span>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The one mount: the store's `composerOpen` drives it. */
export function ComposerHost() {
  const open = useNeedt3Ui((s) => s.composerOpen);
  const setOpen = useNeedt3Ui((s) => s.setComposerOpen);
  return <Composer open={open} onClose={() => setOpen(false)} />;
}
