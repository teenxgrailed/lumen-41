"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { LuArrowUp, LuPlus } from "react-icons/lu";

import {
  type CoFacetKind,
  type CoMark,
  coParse,
} from "@/components/needt/composer/co-parse";

import { newDate } from "@/lib/date-utils";
import { addedLabel } from "@/lib/needt3/day";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useCreateTask, useTaskParts } from "@/lib/needt3/hooks/tasks";
import type { V3Project } from "@/lib/needt3/map";
import { projectColor } from "@/lib/needt3/project-color";
import {
  TASK_ICON_KEYS,
  type TaskIconKey,
  taskIconKey,
} from "@/lib/needt3/task-icon";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { TASK_GLYPH } from "../home/TaskGlyph";
import { PkButton, PkSheet, pkCx } from "../kit";
import {
  CHIP_ROWS,
  type ChipKind,
  canCommit,
  composeFromParse,
  settleCommit,
  vocabularyOf,
  writeFacet,
} from "./compose";
import { PovFact, PovOpt } from "./parts";
import { pillRectFromDom } from "./pillRect";
import { snack } from "./snack";
import { composer as copy } from "./strings";
import { usePkToday } from "./today";

/* What each claimed run is drawn in, under the letters: the desktop line's
   tones, so the same sentence reads the same on both. */
const TONE: Record<CoFacetKind, string> = {
  repeat: "var(--info)",
  deadline: "var(--destructive)",
  duration: "var(--text-tertiary)",
  date: "var(--accent)",
  time: "var(--accent)",
  priority: "var(--destructive)",
  project: "var(--accent)",
  label: "var(--success)",
};

const NO_PROJECTS: V3Project[] = [];
const titleCase = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

type Row =
  | "when"
  | "duration"
  | "project"
  | "priority"
  | "more"
  | "deadline"
  | "notes"
  | "icon";

/** The line drawn again under the transparent field, the claimed runs marked. */
function Mirror({
  text,
  marks,
  projectHue,
}: {
  text: string;
  marks: readonly CoMark[];
  projectHue: string;
}) {
  const out: ReactNode[] = [];
  let at = 0;
  marks.forEach(({ from, to, kind }, i) => {
    if (from > at) out.push(<span key={`p${i}`}>{text.slice(at, from)}</span>);
    const tone = kind === "project" ? projectHue : TONE[kind];
    out.push(
      <span
        key={`m${i}`}
        className="pov-mark"
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
      <span key="parts" className="pov-mark is-parts">
        {tail.slice(slash)}
      </span>
    );
  } else if (tail) out.push(<span key="t">{tail}</span>);
  /* A trailing newline would collapse; the space keeps the last line's height. */
  return (
    <div className="pov-mirror" aria-hidden="true">
      {out}
      {"​"}
    </div>
  );
}

export interface PkComposerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * New task, shaped like the desktop composer (composer/Composer.tsx): one
 * sentence with the understood words marked inside it, and under it the same
 * things the desktop offers as rows in the task sheet's own geometry: When
 * (date and time), Duration, Project, Priority, and under More the Deadline,
 * Notes and Subtasks. Every pick writes words into the line, so the sentence
 * stays the one source of truth. Return adds and keeps the sheet open (the
 * desktop's Enter); Add adds and closes. A snack with Undo says where it landed.
 *
 * Not drawn: the Attachment row (no attachment route on create yet) and
 * Repeat (parsed, not written: //todo with the recurrence rule's phone format).
 */
export function PkComposer({ open, onClose }: PkComposerProps) {
  const today = usePkToday();
  const projects = useProjects().data ?? NO_PROJECTS;
  const create = useCreateTask();
  const partsApi = useTaskParts();
  const [text, setText] = useState("");
  const [row, setRow] = useState<Row | null>(null);
  /* Rows the person asked for from More; a parsed deadline shows by itself. */
  const [extra, setExtra] = useState<readonly ("deadline" | "notes")[]>([]);
  const [note, setNote] = useState("");
  /* The icon the person chose; undefined = automatic (the keyword map reads
     the title, on screen and later in every row). Only a pick is stored. */
  const [iconPick, setIconPick] = useState<TaskIconKey | undefined>(undefined);
  /* A create is in flight: Add and Enter do nothing until it settles. */
  const [sending, setSending] = useState(false);
  const inflight = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const noteField = useRef<HTMLTextAreaElement>(null);
  const rowRef = useRef<Row | null>(null);
  rowRef.current = row;

  /* Focus inside the opening tap: iOS raises the keyboard only for a focus
     that happens in the same gesture, so this is a layout effect (the sheet is
     mounted shut and visible by now) and not a timer. The timer is the
     fallback for engines that moved the field after the first paint. */
  useLayoutEffect(() => {
    if (!open) return;
    input.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const id = window.setTimeout(() => {
      const el = input.current;
      if (el && document.activeElement !== el && !rowRef.current)
        el.focus({ preventScroll: true });
    }, 320);
    return () => window.clearTimeout(id);
  }, [open]);

  /* Notes asked for from More: the field takes the focus as it appears. */
  const notesAsked = extra.includes("notes");
  useEffect(() => {
    if (notesAsked) noteField.current?.focus({ preventScroll: false });
  }, [notesAsked]);
  const vocabulary = useMemo(() => vocabularyOf(projects), [projects]);
  const parse = useMemo(
    () => coParse(text, newDate(), vocabulary),
    [text, vocabulary]
  );
  const found = parse.found;
  const facetOf = (k: ChipKind) => found[k];
  const shownKey = iconPick ?? taskIconKey(parse.title);
  const ShownGlyph = TASK_GLYPH[shownKey];
  const projectHue = found.project?.project.hue || "var(--accent)";

  const focusLine = () => input.current?.focus({ preventScroll: true });

  const write = (k: ChipKind, words: string, keepOpen = false) => {
    setText((cur) =>
      writeFacet(cur, coParse(cur, newDate(), vocabulary), k, words)
    );
    if (!keepOpen) setRow(null);
    focusLine();
  };

  /** What the sheet forgets between two tasks. */
  const forget = () => {
    setText("");
    setRow(null);
    setExtra([]);
    setNote("");
    setIconPick(undefined);
  };

  const commit = useCallback(
    async (andClose: boolean) => {
      const composed = composeFromParse(parse, today, note);
      if (!canCommit(composed, inflight.current)) return;
      if (iconPick) composed.draft.icon = iconPick;
      inflight.current = true;
      setSending(true);
      try {
        const out = await settleCommit(() =>
          create.mutateAsync({ draft: composed.draft })
        );
        // On a failure the text and the sheet stay; the hook has toasted.
        if (!out.ok || !out.value) return;
        forget();
        if (andClose) onClose();
        else focusLine();
        const { result, undo } = out.value;
        if (!result) return;
        try {
          for (const part of composed.parts) {
            await partsApi.add(result.id, part);
          }
        } catch {
          // The task exists; the parts hook has said what it could not add.
        }
        snack(addedLabel(result, today), undo);
      } finally {
        inflight.current = false;
        setSending(false);
      }
    },
    [parse, today, note, iconPick, onClose, create, partsApi]
  );

  /* The sheet has shut: forget the line, unless a send is still running, in
     which case a failure must find its text where it was. */
  const reset = () => {
    if (inflight.current) return;
    forget();
  };

  const toggle = (r: Row) => setRow((x) => (x === r ? null : r));
  const rows = (k: Exclude<ChipKind, "project">) => CHIP_ROWS[k];

  const choices = (k: ChipKind, keepOpen = false): ReactNode => {
    const f = facetOf(k);
    if (k === "project")
      return (
        <>
          {projects.map((p) => (
            <PovOpt
              key={p.id}
              on={f?.text.toLowerCase() === p.name.toLowerCase()}
              onClick={() => write(k, p.name)}
              hue={projectColor(p.id, p.color)}
            >
              {p.name}
            </PovOpt>
          ))}
          {f ? <PovOpt onClick={() => write(k, "")}>No project</PovOpt> : null}
        </>
      );
    return (
      <>
        {rows(k).map(([label, words]) => (
          <PovOpt
            key={label}
            on={!!f && f.text.toLowerCase() === words.toLowerCase()}
            onClick={() => write(k, words, keepOpen)}
          >
            {label}
          </PovOpt>
        ))}
        {f ? (
          <PovOpt onClick={() => write(k, "", keepOpen)}>
            No {k === "deadline" ? "deadline" : k}
          </PovOpt>
        ) : null}
      </>
    );
  };

  const whenValue = [found.date?.label, found.time?.label]
    .filter(Boolean)
    .map((s) => titleCase(s as string))
    .join(" · ");
  const showDeadline = !!found.deadline || extra.includes("deadline");
  const showNotes = extra.includes("notes") || note.length > 0;
  const parts = parse.parts.length;

  return (
    <PkSheet
      open={open}
      onClose={onClose}
      onShut={reset}
      from={pillRectFromDom}
      label={copy.new_task}
      className="pov-composer"
      bodyClass="pov-composer-body"
      keyboard
      footer={
        <>
          <PkButton
            kind="quiet"
            icon={<LuPlus size={18} />}
            disabled={!text.trim() || sending}
            onClick={() => void commit(false)}
            data-pov-another=""
          >
            Add another
          </PkButton>
          <PkButton
            kind="primary"
            icon={<LuArrowUp size={18} />}
            disabled={!text.trim() || sending}
            onClick={() => void commit(true)}
            data-pov-add=""
          >
            {copy.add}
          </PkButton>
        </>
      }
    >
      <div className="pov-titlerow">
        <button
          type="button"
          className={pkCx(
            "pov-icon-btn pk-no-drag",
            row === "icon" && "is-open"
          )}
          aria-label="Task icon"
          aria-expanded={row === "icon"}
          data-pov-icon=""
          /* keep the keyboard up while the icons open */
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => toggle("icon")}
        >
          <ShownGlyph size={20} aria-hidden="true" />
        </button>
        <div className="pov-line">
          <Mirror text={text} marks={parse.marks} projectHue={projectHue} />
          <textarea
            ref={input}
            className="pov-big"
            value={text}
            rows={1}
            enterKeyHint="send"
            autoCapitalize="sentences"
            spellCheck={false}
            placeholder={copy.new_task}
            aria-label={copy.new_task}
            data-pov-line=""
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                if (e.nativeEvent.isComposing) return;
                e.preventDefault();
                void commit(false);
              }
            }}
          />
        </div>
      </div>
      <p className="pov-hint">
        {text.trim()
          ? found.date || found.time
            ? ""
            : copy.lands_on_today
          : copy.say_when_which_project_how_urgent_or_tap}
      </p>
      {row === "icon" ? (
        <div className="pov-icons pk-no-drag" data-pov-pick="icon">
          {TASK_ICON_KEYS.map((k) => {
            const Glyph = TASK_GLYPH[k];
            return (
              <button
                key={k}
                type="button"
                className={pkCx("pov-icon-opt", iconPick === k && "is-on")}
                aria-label={k}
                aria-pressed={iconPick === k}
                data-pov-icon-key={k}
                onPointerDown={(ev) => ev.preventDefault()}
                onClick={() => {
                  setIconPick(k);
                  setRow(null);
                }}
              >
                <Glyph size={20} aria-hidden="true" />
              </button>
            );
          })}
          <div className="pov-icons-auto">
            <PovOpt
              on={iconPick === undefined}
              onClick={() => {
                setIconPick(undefined);
                setRow(null);
              }}
            >
              Automatic
            </PovOpt>
          </div>
        </div>
      ) : null}
      {/* A press on a row or a choice never takes the focus from the line:
          the keyboard stays. Text fields inside (the notes) still focus. */}
      <div
        className="pov-facts pov-form"
        data-pov-form=""
        onPointerDownCapture={(e) => {
          if ((e.target as HTMLElement).closest("button")) e.preventDefault();
        }}
      >
        <PovFact
          id="when"
          label="When"
          value={whenValue || "Today"}
          muted={!whenValue}
          open={row === "when"}
          onToggle={() => toggle("when")}
        >
          {choices("date", true)}
          <span className="pov-opts-break" aria-hidden="true" />
          {choices("time", true)}
        </PovFact>
        <PovFact
          id="duration"
          label="Duration"
          value={found.duration ? found.duration.label : "30 min"}
          muted={!found.duration}
          open={row === "duration"}
          onToggle={() => toggle("duration")}
        >
          {choices("duration")}
        </PovFact>
        <PovFact
          id="project"
          label="Project"
          value={found.project ? found.project.project.name : "None"}
          muted={!found.project}
          open={row === "project"}
          onToggle={() => toggle("project")}
        >
          {choices("project")}
        </PovFact>
        <PovFact
          id="priority"
          label="Priority"
          value={found.priority ? titleCase(found.priority.label) : "Normal"}
          muted={!found.priority}
          open={row === "priority"}
          onToggle={() => toggle("priority")}
        >
          {choices("priority")}
        </PovFact>
        {showDeadline ? (
          <PovFact
            id="deadline"
            label="Deadline"
            value={found.deadline ? titleCase(found.deadline.label) : "Not set"}
            muted={!found.deadline}
            open={row === "deadline"}
            onToggle={() => toggle("deadline")}
          >
            {choices("deadline")}
          </PovFact>
        ) : null}
        {showNotes ? (
          <div className="pov-fact pov-note" data-pov-fact="notes">
            <label className="pov-note-label" htmlFor="pov-note-field">
              Notes
            </label>
            <textarea
              id="pov-note-field"
              ref={noteField}
              className="pov-note-field"
              rows={2}
              value={note}
              spellCheck={false}
              placeholder="Anything to remember"
              data-pov-note=""
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        ) : null}
        <PovFact
          id="more"
          label="More"
          value={parts ? `${parts} subtask${parts === 1 ? "" : "s"}` : ""}
          muted
          open={row === "more"}
          onToggle={() => toggle("more")}
        >
          {!showDeadline ? (
            <PovOpt
              onClick={() => {
                setExtra((x) => [...x, "deadline"]);
                setRow("deadline");
              }}
            >
              Deadline
            </PovOpt>
          ) : null}
          {!showNotes ? (
            <PovOpt
              onClick={() => {
                setExtra((x) => [...x, "notes"]);
                setRow(null);
              }}
            >
              Notes
            </PovOpt>
          ) : null}
          <PovOpt
            onClick={() => {
              setText((t) => (t.includes("/") ? t : `${t.trimEnd()} / `));
              setRow(null);
              focusLine();
            }}
          >
            Subtasks
          </PovOpt>
        </PovFact>
      </div>
    </PkSheet>
  );
}

/** The composer against the store flag (`composerOpen`). */
export function StoreComposer() {
  const open = useNeedt3Ui((s) => s.composerOpen);
  const setOpen = useNeedt3Ui((s) => s.setComposerOpen);
  const close = useCallback(() => setOpen(false), [setOpen]);
  return <PkComposer open={open} onClose={close} />;
}
