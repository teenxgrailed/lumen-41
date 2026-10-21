"use client";

/* QUICK ADD, the desktop app's always-on-top window (spec:
   additions-2/desktop-chrome, dk-qa). Opened by the shell's global shortcut
   (⇧⌘Space / Ctrl+Shift+Space) on its own page: no sidebar, no top bar, just
   the card. One line parsed by the same parser as the composer (what it
   understood is marked in the line and restated as chips under it), and the
   same hooks make the thing, so a quick add is a composer add.

   Enter adds and closes. ⌘/Ctrl+Enter adds and opens it. Tab cycles Task,
   Event, Doc. Esc closes. The shell hides the window when focus leaves it;
   the page only asks to be closed (`needt-quick-close`), and starts clean each
   time the window is focused again. */
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// One entry, so the vendored CSS always loads before the port's overrides.
import "@/styles/v3-entry.css";

import { newDate } from "@/lib/date-utils";
import { desktopPlatform, emitDesktopEvent } from "@/lib/desktop";
import { dayLabel, hhmm, weekday } from "@/lib/needt3/derive";
import { V3_FONT_CLASSES } from "@/lib/needt3/fonts";
import { useCreateDoc } from "@/lib/needt3/hooks/docs";
import { useCreateEvent } from "@/lib/needt3/hooks/events";
import { useCreateHabit } from "@/lib/needt3/hooks/habits";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useCreateTask, useTaskParts } from "@/lib/needt3/hooks/tasks";

import {
  type CoKind,
  type CoMark,
  type ComposerParse,
  DEFAULT_ESTIMATE,
  composerDraft,
  composerParse,
} from "../composer/parse";

/** Tab walks these; a habit is never chosen, the line's "every day" says it. */
const KINDS: CoKind[] = ["task", "event", "doc"];
const KIND_LABEL: Record<CoKind, string> = {
  task: "Task",
  event: "Event",
  doc: "Doc",
  habit: "Habit",
};
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EVENT_MINUTES = 60;

/** The line with what the parse claimed marked (spec: `mark`, an accent ink). */
function Mirror({
  text,
  marks,
  scroll,
}: {
  text: string;
  marks: readonly CoMark[];
  scroll: number;
}) {
  const out: ReactNode[] = [];
  let at = 0;
  marks.forEach(({ from, to }, i) => {
    if (from > at) out.push(<span key={`p${i}`}>{text.slice(at, from)}</span>);
    out.push(<mark key={`m${i}`}>{text.slice(from, to)}</mark>);
    at = Math.max(at, to);
  });
  if (at < text.length) out.push(<span key="t">{text.slice(at)}</span>);
  return (
    <div
      aria-hidden="true"
      className="dk-qa-mirror"
      style={{ transform: `translateX(${-scroll}px)` }}
    >
      {out}
    </div>
  );
}

/** What the line was understood to say. The three of the spec first, then the
    rest the parser can claim. */
function chipsOf(p: ComposerParse, kind: CoKind) {
  const chips: { key: string; label: string; hue?: string }[] = [];
  if (kind !== "task") chips.push({ key: "kind", label: KIND_LABEL[kind] });
  const day = p.date?.day ?? null;
  const when = [
    day ? `${DAY_NAMES[weekday(day)]} ${dayLabel(day)}` : null,
    p.time ? hhmm(p.time.minutes / 60) : null,
  ].filter(Boolean);
  if (when.length) chips.push({ key: "when", label: when.join(" · ") });
  if (p.project) {
    chips.push({
      key: "project",
      label: p.project.label,
      hue: p.project.color ?? "var(--accent)",
    });
  }
  const minutes =
    p.duration?.minutes ??
    (kind === "event"
      ? EVENT_MINUTES
      : kind === "task"
        ? DEFAULT_ESTIMATE
        : null);
  if (minutes != null) {
    chips.push({
      key: "length",
      label: p.duration?.label ?? `${minutes} min`,
    });
  }
  if (p.deadline)
    chips.push({ key: "deadline", label: `by ${p.deadline.label}` });
  if (p.repeat) chips.push({ key: "repeat", label: p.repeat.label });
  if (p.priority) chips.push({ key: "priority", label: p.priority.label });
  return chips;
}

function QuickAddCard() {
  const { data: projects = [] } = useProjects();
  const createTask = useCreateTask();
  const parts = useTaskParts();
  const createDoc = useCreateDoc();
  const createHabit = useCreateHabit();
  const createEvent = useCreateEvent();

  const [text, setText] = useState("");
  const [scroll, setScroll] = useState(0);
  const [type, setType] = useState<CoKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const mod = desktopPlatform() === "windows" ? "Ctrl" : "⌘";

  const p = useMemo(
    () => composerParse(text, newDate(), projects),
    [text, projects]
  );
  const kind = type ?? p.kind;

  const reset = useCallback(() => {
    setText("");
    setScroll(0);
    setType(null);
    setFailed(false);
    setBusy(false);
    window.setTimeout(() => input.current?.focus(), 0);
  }, []);

  // The window is kept hidden between uses: each time it is brought back it
  // starts empty, with the cursor in the line.
  useEffect(() => {
    input.current?.focus();
    window.addEventListener("focus", reset);
    return () => window.removeEventListener("focus", reset);
  }, [reset]);

  const close = (openTask?: string | null) =>
    emitDesktopEvent("needt-quick-close", openTask ? { openTask } : {});

  /** Makes what the line said; for a task, its id (so it can be opened). */
  async function create(parse: ComposerParse, as: CoKind) {
    const draft = composerDraft(parse, newDate(), as, null);
    if (draft.kind === "doc") {
      await createDoc.mutateAsync({ draft: draft.doc });
    } else if (draft.kind === "habit") {
      await createHabit.mutateAsync({ draft: draft.habit });
    } else if (draft.kind === "event") {
      await createEvent(draft.event);
    } else {
      const { result } = await createTask.mutateAsync({ draft: draft.task });
      if (result) {
        try {
          for (const [i, title] of draft.parts.entries())
            await parts.add(result.id, title, i);
        } catch {
          // The task stays; a failed step is not worth a second window.
        }
        return result.id;
      }
    }
    return null;
  }

  async function commit(andOpen: boolean) {
    const line = text.trim();
    if (!line || busy) return;
    const parse = composerParse(line, newDate(), projects);
    setBusy(true);
    setFailed(false);
    try {
      const id = await create(parse, type ?? parse.kind);
      close(andOpen ? id : null);
      reset();
    } catch {
      // Nothing was made: keep the line so it can be sent again.
      setBusy(false);
      setFailed(true);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void commit(e.metaKey || e.ctrlKey);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
      reset();
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      setType(KINDS[(KINDS.indexOf(kind) + 1) % KINDS.length]);
    }
  }

  const chips = text.trim() ? chipsOf(p, kind) : [];

  return (
    <div className="dk-qa" role="dialog" aria-label="Quick add">
      <div className="in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/needt-icon-midnight.svg" alt="" />
        <div className="line">
          <Mirror text={text} marks={p.marks} scroll={scroll} />
          <input
            ref={input}
            value={text}
            spellCheck={false}
            autoComplete="off"
            aria-label="Quick add"
            placeholder="Add a task, event or doc"
            onChange={(e) => {
              setText(e.target.value);
              setScroll(e.target.scrollLeft);
              setFailed(false);
            }}
            onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
      <div className="chips">
        {chips.map((c) => (
          <span className="chip" key={c.key}>
            {c.hue ? <i style={{ ["--c" as string]: c.hue }} /> : null}
            {c.label}
          </span>
        ))}
      </div>
      <div className="bar">
        <span>
          <kbd>↵</kbd>Add
        </span>
        <span>
          <kbd>{mod}↵</kbd>Add and open
        </span>
        <span>
          <kbd>Tab</kbd>Task · Event · Doc
        </span>
        {failed ? (
          <span className="err" role="alert">
            Could not add. Try again.
          </span>
        ) : null}
        <span className="r">
          <kbd>esc</kbd>Close
        </span>
      </div>
    </div>
  );
}

/**
 * The page. A `.needt-v3` scope with no frame, a transparent window around a
 * rounded card; light or dark with the operating system (this window has no
 * theme of its own to read).
 */
export function DesktopQuickAdd() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const read = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  // The window is transparent: the page behind the card must be too.
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.desktopQuick = "";
    return () => {
      delete html.dataset.desktopQuick;
    };
  }, []);
  return (
    <div
      className={`needt-v3 ${V3_FONT_CLASSES} dk dk-qa-root`}
      data-theme={dark ? "dark" : "light"}
      suppressHydrationWarning
    >
      <QuickAddCard />
    </div>
  );
}
