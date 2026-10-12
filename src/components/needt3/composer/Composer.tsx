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

import * as Dialog from "@radix-ui/react-dialog";
import {
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
  LuListPlus,
  LuRepeat,
  LuSun,
  LuSunrise,
  LuX,
} from "react-icons/lu";

import { newDate, toLocalDateKey } from "@/lib/date-utils";
import { dayLabel } from "@/lib/needt3/derive";
import { useCreateDoc } from "@/lib/needt3/hooks/docs";
import { useCreateEvent } from "@/lib/needt3/hooks/events";
import { useCreateHabit } from "@/lib/needt3/hooks/habits";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useCreateTask, useTaskParts } from "@/lib/needt3/hooks/tasks";
import type { V3Project } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

import { useNeedt3Ui } from "@/store/needt3-ui";

import strings from "../../../../docs/port/prototype/port/strings/en.json";
import { useV3PortalContainer } from "../ctx/PortalScope";
import { useExit } from "../ctx/useExit";
import { Tooltip } from "../menu/Tooltip";
import {
  type CoFacetKind,
  type CoKind,
  type CoMark,
  type ComposerFacet,
  type ComposerParse,
  composerDraft,
  composerParse,
  pickFacet,
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
type PickKind = "date" | "duration" | "priority" | "project";

interface PickRow {
  label: string;
  Icon: Icon;
  words: string;
  tone?: string;
}

const PICK: Record<Exclude<PickKind, "project">, (PickRow | null)[]> = {
  date: [
    { label: "Today", Icon: LuSun, words: "today" },
    { label: "Tomorrow", Icon: LuSunrise, words: "tomorrow" },
    { label: "This weekend", Icon: LuCalendarDays, words: "this weekend" },
    { label: "Next week", Icon: LuArrowRight, words: "next week" },
    null,
    { label: "Monday", Icon: LuCalendar, words: "monday" },
    { label: "Friday", Icon: LuCalendar, words: "friday" },
  ],
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
}: {
  open: boolean;
  /** Only a task keeps a description; elsewhere the row would be dropped. */
  withNote: boolean;
  onPick: (words: string | null) => void;
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
          </div>
        </div>
      </div>
    </div>
  );
}

/** What the sentence was understood to say, as chips (label order fixed). */
function chipsOf(p: ComposerParse) {
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
    if (facet) chips.push({ key, Glyph, tone, label: facet.label, facet });
  };
  add("date", LuCalendar, ACCENT, p.date);
  add("time", LuClock, ACCENT, p.time);
  add("duration", LuHourglass, "var(--text-tertiary)", p.duration);
  add("deadline", LuCalendarClock, "var(--destructive)", p.deadline);
  add("repeat", LuRepeat, "var(--info)", p.repeat);
  add("priority", LuFlag, "var(--destructive)", p.priority);
  add("project", LuFolder, hueOf(p.project), p.project);
  if (p.parts.length)
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
  const [menu, setMenu] = useState<PickKind | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [type, setType] = useState<CoKind | null>(null);
  const [flight, setFlight] = useState<{ title: string; key: number } | null>(
    null
  );
  const input = useRef<HTMLInputElement>(null);
  const foot = useRef<HTMLDivElement>(null);

  const { data: projects = [] } = useProjects();
  const createTask = useCreateTask();
  const parts = useTaskParts();
  const createDoc = useCreateDoc();
  const createHabit = useCreateHabit();
  const createEvent = useCreateEvent();

  const p = useMemo(
    () => composerParse(text, newDate(), projects),
    [text, projects]
  );
  const kind = type ?? p.kind;

  useEffect(() => {
    if (!open) {
      setMenu(null);
      setMore(false);
      return;
    }
    setText("");
    setScroll(0);
    setType(null);
    setNote(null);
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

  const facetOf = (k: PickKind): ComposerFacet | null => p[k];

  async function create(parse: ComposerParse, as: CoKind, said: string | null) {
    const draft = composerDraft(parse, newDate(), as, said);
    const undoable = (msg: string, undo: () => Promise<void>) =>
      notify.success(msg, {
        action: { label: "Undo", onClick: () => void undo() },
      });
    try {
      if (draft.kind === "doc") {
        const { undo } = await createDoc.mutateAsync({ draft: draft.doc });
        undoable("Doc created", undo);
      } else if (draft.kind === "habit") {
        const { undo } = await createHabit.mutateAsync({ draft: draft.habit });
        undoable("Habit added", undo);
      } else if (draft.kind === "event") {
        const { undo } = await createEvent(draft.event);
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
        }
      }
    } catch {
      // The hook has already told the person and put the cache back.
    }
  }

  function commit() {
    const line = text.trim();
    if (!line) return;
    const parse = composerParse(line, newDate(), projects);
    void create(parse, type ?? parse.kind, note);
    /* What was made lifts off the sheet and fades upward; the sheet stays.
       Under reduced motion nothing flies. */
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
      setFlight({ title: parse.title, key: newDate().getTime() });
    setText("");
    setScroll(0);
    setType(null);
    setNote(null);
    setMenu(null);
    input.current?.focus();
  }

  if (!shown || !container) return null;
  const out = leaving ? " is-leaving" : "";
  const chips = chipsOf(p);
  const assumeToday = !p.date && !p.repeat && !!text.trim();

  const footBtn = (k: PickKind, Glyph: Icon, label: string, tone: string) => {
    const value = facetOf(k)?.label ?? null;
    const rows =
      k === "project"
        ? projects.map(
            (pr: V3Project): PickRow => ({
              label: pr.name,
              Icon: LuFolder,
              words: pr.name,
              tone: hueOf(pr),
            })
          )
        : PICK[k];
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
          onPick={(words) => edit((t) => pickFacet(t, facetOf(k), words))}
          onClear={() => edit((t) => stripFacet(t, facetOf(k)))}
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
            <Dialog.Title className="sr-only">{T.new_task}</Dialog.Title>
            {flight ? (
              <span key={flight.key} className="co-flight">
                {flight.title}
              </span>
            ) : null}
            <div className="cmp-body">
              <div className="base-row">
                <div className="cmp-seg" role="tablist" aria-label={T.kind}>
                  {SEGMENTS.map((k) => {
                    const { Icon: Glyph, label } = KINDS[k];
                    return (
                      <button
                        key={k}
                        type="button"
                        role="tab"
                        aria-selected={kind === k}
                        className={kind === k ? "is-on" : ""}
                        onClick={() => {
                          setType(k === p.kind ? null : k);
                          refocus();
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
                  aria-label={T.task_name}
                  placeholder={T.new_task}
                  onChange={(e) => {
                    setText(e.target.value);
                    setScroll(e.target.scrollLeft);
                  }}
                  onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      if (e.nativeEvent.isComposing) return;
                      e.preventDefault();
                      commit();
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

              <Shelf
                open={more}
                withNote={kind === "task"}
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
              {footBtn("date", LuCalendar, T.date, ACCENT)}
              {footBtn(
                "duration",
                LuClock,
                T.duration,
                "var(--text-secondary)"
              )}
              {footBtn("project", LuFolder, T.project, hueOf(p.project))}
              {footBtn("priority", LuFlag, T.priority, "var(--destructive)")}
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
              <span className="shell-composer-row-2">
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
                  disabled={!text.trim()}
                  onClick={commit}
                >
                  {kind === "event"
                    ? T.add_event
                    : kind === "doc"
                      ? T.add_doc
                      : kind === "habit"
                        ? T.add_habit
                        : T.add_task}
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
