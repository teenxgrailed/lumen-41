"use client";

import { useEffect, useRef, useState } from "react";

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
    <div className="hq-breath" aria-label={`${left} seconds left`}>
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
      <em className="hq-num" aria-live="polite">
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
            if (e.key === "Enter" && text.trim()) {
              onChange({ tag: text.trim(), strength });
            }
          }}
          onBlur={() => {
            if (text.trim()) onChange({ tag: text.trim(), strength });
          }}
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

export interface QuitPullProps {
  title: string;
  reason: string | null;
  /** The run before this pull; the reason step says how long it has been. */
  run: RunParts;
  since: string | null;
  best: number;
  clean: number;
  /** Pulls held so far, for the held step's line. */
  held: number;
  pro: boolean;
  desk?: boolean;
  online: boolean;
  /** "No, it passed". */
  onHeld: () => void;
  /** "Yes, still": Pro opens the assistant, Free the upgrade. */
  onStill: () => void;
  /** "Start again" after "I slipped". */
  onSlip: () => void;
  onTrigger: (t: PullTrigger) => void;
  onClose: () => void;
}

/** The pull flow. The step is local: it starts over with every press. */
export function QuitPull(p: QuitPullProps) {
  const [step, setStep] = useState<PullStep>("breathe");
  const [elapsed, setElapsed] = useState(0);
  const [trigger, setTrigger] = useState<PullTrigger | null>(null);
  const started = useRef(0);

  useEffect(() => {
    if (step !== "breathe") return;
    started.current = performance.now();
    const t = window.setInterval(() => {
      const e = performance.now() - started.current;
      setElapsed(e);
      if (e >= BREATH_MS) setStep(p.reason ? "reason" : "ask");
    }, 250);
    return () => window.clearInterval(t);
    // The breath runs once per flow; a reason edited mid-breath changes nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") p.onClose();
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [p]);

  const cls = `hq-pull${p.desk ? " is-desk" : ""}`;
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
  const afterBreath = () => setStep(p.reason ? "reason" : "ask");

  if (step === "breathe")
    return (
      <div
        className={cls}
        role="dialog"
        aria-label="Pulling"
        data-hq-step="breathe"
      >
        <span className="step">Breathe · {clock(BREATH_MS - elapsed)}</span>
        {close}
        <Breath elapsed={elapsed} />
        <h3>Stay with the breath for a minute.</h3>
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
      </div>
    );

  if (step === "reason")
    return (
      <div
        className={cls}
        role="dialog"
        aria-label="Pulling"
        data-hq-step="reason"
      >
        <span className="step">Your reason</span>
        {close}
        <div className="hq-quote">
          “{p.reason}”
          <small>
            {p.since ? `You wrote this on ${p.since}. ` : ""}
            {p.run.days} {p.run.days === 1 ? "day" : "days"} without so far.
          </small>
        </div>
        <div className="acts">
          <button
            type="button"
            className="hq-btn is-primary is-wide"
            onClick={() => setStep("ask")}
          >
            Next
          </button>
        </div>
      </div>
    );

  if (step === "ask")
    return (
      <div
        className={cls}
        role="dialog"
        aria-label="Pulling"
        data-hq-step="ask"
      >
        <span className="step">One question</span>
        {close}
        <h3>Still pulling?</h3>
        <div className="acts">
          <button
            type="button"
            className="hq-btn is-wide"
            data-hq-passed=""
            onClick={() => {
              p.onHeld();
              setStep("held");
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
            onClick={() => setStep("slip")}
          >
            I slipped
          </button>
        </div>
      </div>
    );

  if (step === "slip")
    return (
      <div
        className={cls}
        role="dialog"
        aria-label="Pulling"
        data-hq-step="slip"
      >
        {close}
        <QuitSlipConfirm
          run={p.run}
          best={p.best}
          clean={p.clean}
          onCancel={() => setStep("ask")}
          onConfirm={() => {
            p.onSlip();
            p.onClose();
          }}
        />
      </div>
    );

  return (
    <div className={cls} role="dialog" aria-label="Pulling" data-hq-step="held">
      <span className="step">Held</span>
      {close}
      <QuitHeld />
      <h3>You held it.</h3>
      <p>
        {p.held + 1} {p.held + 1 === 1 ? "pull" : "pulls"} held. Note what set
        it off — one tap, so the pattern shows later.
      </p>
      <QuitTrigger
        value={trigger}
        onChange={(t) => {
          setTrigger(t);
          p.onTrigger(t);
        }}
      />
      <div className="acts">
        <button
          type="button"
          className="hq-btn is-primary is-wide"
          onClick={p.onClose}
        >
          Done
        </button>
      </div>
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
