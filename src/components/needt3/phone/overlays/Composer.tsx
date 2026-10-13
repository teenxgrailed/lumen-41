"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { LuArrowUp, LuCalendar, LuFlag, LuFolder } from "react-icons/lu";

import { coParse } from "@/components/needt/composer/co-parse";

import { newDate } from "@/lib/date-utils";
import { addedLabel } from "@/lib/needt3/day";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useCreateTask, useTaskParts } from "@/lib/needt3/hooks/tasks";
import type { V3Project } from "@/lib/needt3/map";

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
  const [pick, setPick] = useState<ChipKind | null>(null);
  /* A create is in flight: Add and Enter do nothing until it settles. */
  const [sending, setSending] = useState(false);
  const inflight = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const id = window.setTimeout(
      () => input.current?.focus({ preventScroll: true }),
      320
    );
    return () => window.clearTimeout(id);
  }, [open]);
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const vocabulary = useMemo(() => vocabularyOf(projects), [projects]);
  const parse = useMemo(
    () => coParse(text, newDate(), vocabulary),
    [text, vocabulary]
  );
  const found = parse.found;
  const facetOf = (k: ChipKind) =>
    k === "date"
      ? found.date
      : k === "project"
        ? found.project
        : found.priority;

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
  }, [parse, today, onClose, create, partsApi]);

  /* The sheet has shut: forget the line, unless a send is still running, in
     which case a failure must find its text where it was. */
  const reset = () => {
    if (inflight.current) return;
    setText("");
    setPick(null);
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
      <textarea
        ref={input}
        className="pov-big"
        value={text}
        rows={2}
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
      {pick ? (
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
