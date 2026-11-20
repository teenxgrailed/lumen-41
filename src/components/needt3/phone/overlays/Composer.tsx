"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  LuArrowUp,
  LuCalendar,
  LuClock,
  LuFlag,
  LuFolder,
  LuSmilePlus,
  LuTimer,
} from "react-icons/lu";

import { coParse } from "@/components/needt/composer/co-parse";

import { newDate } from "@/lib/date-utils";
import { addedLabel } from "@/lib/needt3/day";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useCreateTask, useTaskParts } from "@/lib/needt3/hooks/tasks";
import type { V3Project } from "@/lib/needt3/map";
import { TASK_ICON_CHOICES, taskIconFor } from "@/lib/needt3/task-icon";

import { useNeedt3Ui } from "@/store/needt3-ui";

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
import { PovOpt } from "./parts";
import { pillRectFromDom } from "./pillRect";
import { snack } from "./snack";
import { composerPick, composer as copy } from "./strings";
import { usePkToday } from "./today";

const CHIPS: readonly {
  kind: ChipKind;
  label: string;
  icon: React.ReactNode;
}[] = [
  { kind: "date", label: composerPick.date, icon: <LuCalendar size={14} /> },
  { kind: "time", label: "Time", icon: <LuClock size={14} /> },
  { kind: "duration", label: "Duration", icon: <LuTimer size={14} /> },
  {
    kind: "project",
    label: composerPick.project,
    icon: <LuFolder size={14} />,
  },
  {
    kind: "priority",
    label: composerPick.priority,
    icon: <LuFlag size={14} />,
  },
];

const NO_PROJECTS: V3Project[] = [];
const titleCase = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

export interface PkComposerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * New task, one big field (phone-overlays.jsx `PkComposer`). The sheet grows
 * out of menu A's closed pill and goes back into it (`from`); with no pill on
 * the screen it slides. The words are read by the shared composer parser
 * (`co-parse.ts`); the Date / Project / Priority chips write words back into
 * the line, so what is drawn is always what was typed. Add (or Enter) creates
 * the task through `useCreateTask` and says where it landed, with Undo.
 *
 * Not drawn: the Attachment chip, because a task has no attachment route yet
 * (//todo with `TaskAttachment`, migration M2).
 */
export function PkComposer({ open, onClose }: PkComposerProps) {
  const today = usePkToday();
  const projects = useProjects().data ?? NO_PROJECTS;
  const create = useCreateTask();
  const partsApi = useTaskParts();
  const [text, setText] = useState("");
  const [pick, setPick] = useState<ChipKind | "icon" | null>(null);
  /* The icon the person chose; undefined = the keyword map's pick, null = none. */
  const [iconPick, setIconPick] = useState<string | null | undefined>(
    undefined
  );
  /* A create is in flight: Add and Enter do nothing until it settles. */
  const [sending, setSending] = useState(false);
  const inflight = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);

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
      if (el && document.activeElement !== el && !pickRef.current)
        el.focus({ preventScroll: true });
    }, 320);
    return () => window.clearTimeout(id);
  }, [open]);
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const pickRef = useRef<typeof pick>(null);
  pickRef.current = pick;
  const vocabulary = useMemo(() => vocabularyOf(projects), [projects]);
  const parse = useMemo(
    () => coParse(text, newDate(), vocabulary),
    [text, vocabulary]
  );
  const found = parse.found;
  const facetOf = (k: ChipKind) =>
    k === "date"
      ? found.date
      : k === "time"
        ? found.time
        : k === "duration"
          ? found.duration
          : k === "project"
            ? found.project
            : found.priority;
  const suggested = useMemo(() => taskIconFor(parse.title), [parse.title]);
  const icon = iconPick === undefined ? suggested : iconPick;

  const write = (k: ChipKind, words: string) => {
    setText((cur) =>
      writeFacet(cur, coParse(cur, newDate(), vocabulary), k, words)
    );
    setPick(null);
    input.current?.focus({ preventScroll: true });
  };

  const commit = useCallback(async () => {
    const composed = composeFromParse(parse, today);
    if (!canCommit(composed, inflight.current)) return;
    if (icon) composed.draft.icon = icon;
    inflight.current = true;
    setSending(true);
    try {
      const out = await settleCommit(() =>
        create.mutateAsync({ draft: composed.draft })
      );
      // On a failure the text and the sheet stay; the hook has toasted.
      if (!out.ok || !out.value) return;
      setText("");
      setPick(null);
      setIconPick(undefined);
      onClose();
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
  }, [parse, today, icon, onClose, create, partsApi]);

  /* The sheet has shut: forget the line, unless a send is still running, in
     which case a failure must find its text where it was. */
  const reset = () => {
    if (inflight.current) return;
    setText("");
    setPick(null);
    setIconPick(undefined);
  };

  const rows = (k: ChipKind): readonly (readonly [string, string])[] =>
    k === "project"
      ? projects.map((p) => [p.name, p.name] as const)
      : CHIP_ROWS[k];

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
        <PkButton
          kind="primary"
          icon={<LuArrowUp size={18} />}
          disabled={!text.trim() || sending}
          onClick={() => void commit()}
          data-pov-add=""
        >
          {copy.add}
        </PkButton>
      }
    >
      <div className="pov-titlerow">
        <button
          type="button"
          className={pkCx(
            "pov-icon-btn pk-no-drag",
            pick === "icon" && "is-open"
          )}
          aria-label="Task icon"
          aria-expanded={pick === "icon"}
          data-pov-icon=""
          /* keep the keyboard up while the icons open */
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => setPick((x) => (x === "icon" ? null : "icon"))}
        >
          {icon ?? <LuSmilePlus size={22} />}
        </button>
        <textarea
          ref={input}
          className="pov-big"
          value={text}
          rows={1}
          enterKeyHint="done"
          autoCapitalize="sentences"
          spellCheck={false}
          placeholder={copy.new_task}
          aria-label={copy.new_task}
          data-pov-line=""
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void commit();
            }
          }}
        />
      </div>
      <p className="pov-hint">
        {text.trim()
          ? found.time
            ? `${copy.at} ${found.time.label}`
            : found.date
              ? ""
              : copy.lands_on_today
          : copy.say_when_which_project_how_urgent_or_tap}
      </p>
      <div className="pov-cchips pk-no-drag">
        {CHIPS.map(({ kind, label, icon }) => {
          const f = facetOf(kind);
          return (
            <button
              key={kind}
              type="button"
              className={pkCx(
                "pov-cchip",
                f && "is-set",
                pick === kind && "is-open"
              )}
              aria-expanded={pick === kind}
              data-pov-chip={kind}
              /* a chip never takes the focus from the field: the keyboard stays */
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setPick((x) => (x === kind ? null : kind))}
            >
              {icon}
              <span className="pov-cchip-text">
                {f ? titleCase(f.label) : label}
              </span>
            </button>
          );
        })}
      </div>
      {pick === "icon" ? (
        <div className="pov-icons pk-no-drag" data-pov-pick="icon">
          {TASK_ICON_CHOICES.map((e) => (
            <button
              key={e}
              type="button"
              className={pkCx("pov-icon-opt", icon === e && "is-on")}
              aria-label={e}
              onPointerDown={(ev) => ev.preventDefault()}
              onClick={() => {
                setIconPick(e);
                setPick(null);
              }}
            >
              {e}
            </button>
          ))}
          <PovOpt
            onClick={() => {
              setIconPick(null);
              setPick(null);
            }}
          >
            No icon
          </PovOpt>
        </div>
      ) : pick ? (
        <div className="pov-opts is-composer pk-no-drag" data-pov-pick={pick}>
          {rows(pick).map(([label, words]) => {
            const f = facetOf(pick);
            const project =
              pick === "project"
                ? projects.find((p) => p.name === label)
                : null;
            return (
              <PovOpt
                key={label}
                on={!!f && f.text.toLowerCase() === words.toLowerCase()}
                onClick={() => write(pick, words)}
                hue={
                  project ? (project.color ?? "var(--text-muted)") : undefined
                }
              >
                {label}
              </PovOpt>
            );
          })}
          {facetOf(pick) ? (
            <PovOpt onClick={() => write(pick, "")}>
              {copy.no}{" "}
              {CHIPS.find((c) => c.kind === pick)?.label.toLowerCase()}
            </PovOpt>
          ) : null}
        </div>
      ) : null}
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
