"use client";

import { useEffect, useRef, useState } from "react";

import { newDate } from "@/lib/date-utils";
import {
  BREATH_HALF_MS,
  BREATH_MS,
  type RunParts,
  URGE_TAGS,
} from "@/lib/needt3/habits-quit";

import { QuitHeld, QuitSlipConfirm, QuitX } from "./QuitParts";

/*
 * 3 · Pulling (hq.jsx HqPull): full screen on the canvas itself, never a
 * sheet. Breathe for a minute → the person's own reason → "Still pulling?"
 * → held + one-tap trigger, or the assistant with the context already in it
 * (Pro). The pull is logged on the press, before any of this, so closing at
 * any step still counts it.
 *
 * The step and the breath's start belong to the route (`useQuitController`),
 * so crossing 700 px keeps the flow where it was. One dialog for every step:
 * modal, its own label per step, focus on the step's heading, Tab kept
 * inside, the rest of the page inert, focus back on Pulling when it closes.
 */

export type PullStep = "breathe" | "reason" | "ask" | "held" | "slip";

export interface PullTrigger {
  tag: string;
  strength: number | null;
}

/** 3 · the breath: in 5.2 s, out 5.2 s, the ring fills over the minute. */
function Breath({ elapsed }: { elapsed: number }) {
  const r = 96;
  const c = 2 * Math.PI * r;
  const done = Math.min(1, elapsed / BREATH_MS);
  const inhale = Math.floor(elapsed / BREATH_HALF_MS) % 2 === 0;
  const left = Math.max(0, Math.ceil((BREATH_MS - elapsed) / 1000));
  return (
    <div className="hq-breath" role="timer" aria-label={`${left} seconds left`}>
      <div className="disc" />
      <svg viewBox="0 0 200 200" aria-hidden>
        <circle className="bg" cx="100" cy="100" r={r} />
        <circle
          className="fg"
          cx="100"
          cy="100"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - done)}
        />
      </svg>
      {/* Not live: a change every 5.2 s for a minute is noise to a reader. */}
      <em className="hq-num" aria-hidden>
        {inhale ? "Breathe in" : "Breathe out"}
      </em>
    </div>
  );
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** 3b · what set it off: one tap saves; "Other…" asks for one line. */
export function QuitTrigger({
  value,
  compact,
  onChange,
}: {
  value: PullTrigger | null;
  compact?: boolean;
  onChange: (t: PullTrigger) => void;
}) {
  const [other, setOther] = useState(false);
  const [text, setText] = useState("");
  const known = URGE_TAGS.some(([k]) => k === value?.tag);
  const strength = value?.strength ?? null;
  const commit = () => {
    if (text.trim()) onChange({ tag: text.trim(), strength });
  };
  return (
    <div className="hq-trig">
      {compact ? null : <span className="hq-eyebrow">What set it off</span>}
      <div className="tags">
        {URGE_TAGS.map(([key, label]) => {
          const on =
            key === "other" ? other || (!!value && !known) : value?.tag === key;
          return (
            <button
              key={key}
              type="button"
              className="hq-chip"
              aria-pressed={on}
              onClick={() => {
                if (key === "other") {
                  setOther(true);
                  return;
                }
                setOther(false);
                onChange({ tag: key, strength });
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      {other ? (
        <input
          className="hq-field is-wide hq-other"
          aria-label="What set it off"
          placeholder="In a few words"
          maxLength={64}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              // Esc here keeps what was typed and leaves the field, not the flow.
              e.stopPropagation();
              commit();
              e.currentTarget.blur();
            }
          }}
          onBlur={commit}
        />
      ) : null}
      <div className="hq-scale" role="group" aria-label="How strong">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={strength === n}
            onClick={() =>
              onChange({ tag: value?.tag ?? "other", strength: n })
            }
          >
            {n}
          </button>
        ))}
      </div>
      <span className="hq-meta">
        How strong, 1 to 5. Saved on tap; nothing else to confirm.
      </span>
    </div>
  );
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), textarea, [href], [tabindex]:not([tabindex="-1"])';

/**
 * The modal part of the flow: everything outside `root` is inert while it is
 * open (each sibling along the way up to <body>), and on close focus goes
 * back to where it came from, or to `restore` when that is gone.
 */
function useModal(
  root: React.RefObject<HTMLElement | null>,
  restore: string | undefined
) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const before = document.activeElement as HTMLElement | null;
    const made: HTMLElement[] = [];
    for (let node: HTMLElement | null = el; node && node !== document.body; ) {
      const parent: HTMLElement | null = node.parentElement;
      if (!parent) break;
      for (const sib of Array.from(parent.children)) {
        if (sib !== node && sib instanceof HTMLElement && !sib.inert) {
          sib.inert = true;
          made.push(sib);
        }
      }
      node = parent;
    }
    return () => {
      made.forEach((m) => (m.inert = false));
      // After the list has drawn again, so the Pulling button exists.
      window.setTimeout(() => {
        const back =
          before && before.isConnected && before !== document.body
            ? before
            : restore
              ? document.querySelector<HTMLElement>(restore)
              : null;
        back?.focus();
      }, 0);
    };
    // Once per flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export interface QuitPullProps {
  title: string;
  reason: string | null;
  /** The run before this pull; the reason step says how long it has been. */
  run: RunParts;
  /** Days of the run as the server counts them. */
  days: number;
  since: string | null;
  best: number;
  clean: number;
  /** Pulls held so far, for the held step's line. */
  held: number;
  pro: boolean;
  desk?: boolean;
  online: boolean;
  step: PullStep;
  /** When the breath began (epoch ms); the flow survives a remount. */
  startedAt: number;
  trigger: PullTrigger | null;
  /** Where focus goes when the flow closes and its opener is gone. */
  restore?: string;
  onStep: (step: PullStep) => void;
  /** "No, it passed". */
  onHeld: () => void;
  /** "Yes, still": Pro opens the assistant, Free the upgrade. */
  onStill: () => void;
  /** "Start again" after "I slipped": resolves true once the slip is saved. */
  onSlip: () => Promise<boolean>;
  onTrigger: (t: PullTrigger) => void;
  onClose: () => void;
}

/** The pull flow. */
export function QuitPull(p: QuitPullProps) {
  const { step, onStep } = p;
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, newDate().getTime() - p.startedAt)
  );
  const [slipping, setSlipping] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const live = useRef(p);
  live.current = p;
  useModal(root, p.restore);

  useEffect(() => {
    if (step !== "breathe") return;
    const tick = () => {
      const e = Math.max(0, newDate().getTime() - live.current.startedAt);
      setElapsed(e);
      if (e >= BREATH_MS)
        live.current.onStep(live.current.reason ? "reason" : "ask");
    };
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [step]);

  // Each step's heading takes focus, so a reader hears where they are.
  useEffect(() => {
    root.current?.querySelector<HTMLElement>("[data-hq-focus]")?.focus();
  }, [step]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      // From the slip question Esc goes back a step, not out of the flow.
      if (live.current.step === "slip") live.current.onStep("ask");
      else live.current.onClose();
      return;
    }
    if (e.key !== "Tab" || !root.current) return;
    const items = Array.from(
      root.current.querySelectorAll<HTMLElement>(FOCUSABLE)
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || !root.current.contains(at))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (at === last || !root.current.contains(at))) {
      e.preventDefault();
      first.focus();
    }
  };

  const labelId = `hq-pull-${step}`;
  const close = (
    <button
      type="button"
      className="hq-btn is-text is-sm x"
      aria-label="Close"
      onClick={p.onClose}
    >
      <QuitX />
    </button>
  );
  const afterBreath = () => onStep(p.reason ? "reason" : "ask");

  let content: React.ReactNode;
  if (step === "breathe")
    content = (
      <>
        <span className="step">Breathe · {clock(BREATH_MS - elapsed)}</span>
        {close}
        <Breath elapsed={elapsed} />
        <h3 id={labelId} tabIndex={-1} data-hq-focus="">
          Stay with the breath for a minute.
        </h3>
        <p>
          In as the circle grows, out as it falls. The pull usually passes in a
          few minutes.
        </p>
        <div className="acts">
          <button
            type="button"
            className="hq-btn is-text"
            onClick={afterBreath}
          >
            {p.reason ? "Skip to my reason" : "Skip"}
          </button>
        </div>
      </>
    );
  else if (step === "reason")
    content = (
      <>
        <span className="step" id={labelId} tabIndex={-1} data-hq-focus="">
          Your reason
        </span>
        {close}
        <div className="hq-quote">
          “{p.reason}”
          <small>
            {p.since ? `Since ${p.since}: ` : ""}
            {p.run.days} {p.run.days === 1 ? "day" : "days"} without so far.
          </small>
        </div>
        <div className="acts">
          <button
            type="button"
            className="hq-btn is-primary is-wide"
            onClick={() => onStep("ask")}
          >
            Next
          </button>
        </div>
      </>
    );
  else if (step === "ask")
    content = (
      <>
        <span className="step">One question</span>
        {close}
        <h3 id={labelId} tabIndex={-1} data-hq-focus="">
          Still pulling?
        </h3>
        <div className="acts">
          <button
            type="button"
            className="hq-btn is-wide"
            data-hq-passed=""
            onClick={() => {
              p.onHeld();
              onStep("held");
            }}
          >
            No, it passed
          </button>
          <button
            type="button"
            className="hq-btn is-wide"
            data-hq-still=""
            disabled={p.pro && !p.online}
            onClick={p.onStill}
          >
            Yes, still {p.pro ? null : <span className="hq-pro">PRO</span>}
          </button>
          {p.pro && !p.online ? (
            <span className="hq-meta">Needs a connection</span>
          ) : null}
          <button
            type="button"
            className="hq-btn is-text"
            onClick={() => onStep("slip")}
          >
            I slipped
          </button>
        </div>
      </>
    );
  else if (step === "slip")
    content = (
      <>
        {close}
        <QuitSlipConfirm
          run={p.run}
          days={p.days}
          best={p.best}
          clean={p.clean}
          busy={slipping}
          onCancel={() => onStep("ask")}
          onConfirm={() => {
            if (slipping) return;
            setSlipping(true);
            // Closes only once the slip is saved; on a failure the flow stays
            // open and the hook has said why.
            void p.onSlip().then((ok) => {
              setSlipping(false);
              if (ok) live.current.onClose();
            });
          }}
        />
      </>
    );
  else
    content = (
      <>
        <span className="step">Held</span>
        {close}
        <QuitHeld />
        <h3 id={labelId} tabIndex={-1} data-hq-focus="">
          You held it.
        </h3>
        <p>
          {p.held + 1} {p.held + 1 === 1 ? "pull" : "pulls"} held. Note what set
          it off — one tap, so the pattern shows later.
        </p>
        <QuitTrigger value={p.trigger} onChange={p.onTrigger} />
        <div className="acts">
          <button
            type="button"
            className="hq-btn is-primary is-wide"
            onClick={p.onClose}
          >
            Done
          </button>
        </div>
      </>
    );

  return (
    <div
      ref={root}
      className={`hq-pull${p.desk ? " is-desk" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={step === "slip" ? "hq-slip-q" : labelId}
      data-hq-step={step}
      onKeyDown={onKeyDown}
    >
      {content}
    </div>
  );
}

/** 6 · New habit: Do or Quit first. Quit on Free shows its PRO mark. */
export function QuitKindPicker({
  kind,
  locked,
  onChange,
}: {
  kind: "BUILD" | "QUIT";
  locked: boolean;
  onChange: (kind: "BUILD" | "QUIT") => void;
}) {
  return (
    <div className="hq-kinds" role="group" aria-label="Kind of habit">
      <button
        type="button"
        className="hq-kind"
        aria-pressed={kind === "BUILD"}
        onClick={() => onChange("BUILD")}
      >
        <b>Do</b>
        <span>Something to keep doing. Marked on the days it happens.</span>
      </button>
      <button
        type="button"
        className="hq-kind"
        aria-pressed={kind === "QUIT"}
        data-hq-kind-quit=""
        onClick={() => onChange("QUIT")}
      >
        <b>Quit {locked ? <span className="hq-pro">PRO</span> : null}</b>
        <span>Something to stop. Counts the time without it.</span>
      </button>
    </div>
  );
}
