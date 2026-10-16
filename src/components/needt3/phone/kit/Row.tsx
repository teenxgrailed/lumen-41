"use client";

import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { LuArrowRight, LuCheck, LuPaperclip } from "react-icons/lu";

import { clock, durLabel } from "@/lib/needt3/day";
import { dueLabel, at as hourAt } from "@/lib/needt3/derive";
import {
  SWIPE_AT,
  type Sample,
  type SwipeSide,
  axisOf,
  pushSample,
  sideOf,
  swipeArmed,
  swipeOffset,
  swipeRelease,
  swipeReveal,
  velocity,
} from "@/lib/needt3/gesture";
import type { V3Task } from "@/lib/needt3/map";

import { PkSweep } from "./Material";
import { type EndReason, frameWriter, pkTrack } from "./pointer";
import { usePkPlate } from "./theme";
import { pkCx, pkReduced } from "./util";

interface Drag {
  id: number;
  x0: number;
  y0: number;
  kind: "swipe" | "none" | null;
  armed: SwipeSide | null;
  s: Sample[];
  dx: number;
  off: () => void;
}

export interface PkRowProps {
  id: string;
  title: string;
  meta?: ReactNode;
  time?: string | null;
  lead?: ReactNode;
  /** One button at the end; a swipe never starts on it. */
  action?: ReactNode;
  label?: string;
  done?: boolean;
  late?: boolean;
  /** The exit in steps: the check shows, or the row is thrown off the edge. */
  phase?: "check" | "done" | "later";
  /** Folds the row shut. */
  out?: boolean;
  canDone?: boolean;
  canLater?: boolean;
  onCheck?: () => void;
  onOpen?: () => void;
  onSwipe?: (side: SwipeSide) => void;
  doneLabel?: string;
  laterLabel?: string;
  doneIcon?: ReactNode;
  laterIcon?: ReactNode;
  /** `false` drops the check ring (event rows). */
  check?: boolean;
}

/**
 * A row on the ground: [lead | check ring] [one open button: title, meta,
 * time] [action] — siblings, never a button in a button. Swipe right = done,
 * left = tomorrow: the row follows the finger 1:1 to 92 px, then a rubber
 * band; a flick counts. The reveal behind it is the plate surface (muted in
 * dark) or the raised grey. The row's `transform` is written through a ref,
 * once per frame (one rAF per pointer stream); React state changes only when
 * the swipe arms or disarms.
 */
export function PkRow({
  id,
  title,
  meta,
  time,
  lead,
  action,
  label,
  done: doneIn,
  late,
  phase,
  out,
  canDone,
  canLater,
  onCheck,
  onOpen,
  onSwipe,
  doneLabel,
  laterLabel,
  doneIcon,
  laterIcon,
  check,
}: PkRowProps) {
  const plate = usePkPlate();
  const wrap = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const G = useRef<Drag | null>(null);
  const ended = useRef(Number.NEGATIVE_INFINITY);
  const frame = useRef(frameWriter());
  const [armed, setArmed] = useState<SwipeSide | null>(null);
  const done = !!doneIn || phase === "check";
  const allow = { canDone, canLater };
  const swipes = !!onSwipe && (canDone || canLater);

  useEffect(() => {
    const w = frame.current;
    return () => {
      w.cancel();
      G.current?.off();
    };
  }, []);

  const set = (x: number, k: number, side: SwipeSide | null) => {
    if (row.current)
      row.current.style.transform = x
        ? `translate3d(${x.toFixed(1)}px,0,0)`
        : "";
    if (wrap.current) {
      wrap.current.style.setProperty("--pk-k", k.toFixed(3));
      wrap.current.setAttribute("data-pk-side", side ?? "");
    }
  };

  const move = (e: PointerEvent) => {
    const d = G.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    pushSample(d.s, performance.now(), e.clientX);
    if (!d.kind) {
      const axis = axisOf(dx, dy);
      if (!axis) return;
      d.kind = axis === "x" ? "swipe" : "none";
      if (d.kind === "swipe") wrap.current?.classList.add("is-dragging");
    }
    if (d.kind !== "swipe") return;
    if (e.cancelable) e.preventDefault();
    d.dx = dx;
    frame.current.schedule(() =>
      set(swipeOffset(dx, allow), swipeReveal(dx, allow), sideOf(dx))
    );
    const next = swipeArmed(dx, allow);
    if (next !== d.armed) {
      d.armed = next;
      setArmed(next);
    }
  };

  const end = (_e: PointerEvent | null, reason: EndReason) => {
    const d = G.current;
    G.current = null;
    frame.current.cancel();
    if (!d || !d.kind) return;
    ended.current = performance.now();
    if (d.kind !== "swipe") return;
    wrap.current?.classList.remove("is-dragging");
    // The last move's offset decides, not the up event's own coordinates; a
    // cancel (a real pointercancel, or a hold that took the finger) commits
    // nothing and the row goes home.
    const dx = d.dx;
    const side = swipeRelease(reason, dx, velocity(d.s), allow);
    setArmed(null);
    if (!side) {
      set(0, 0, null);
      return;
    }
    // Thrown: off the edge, then the parent folds the row away and commits.
    wrap.current?.classList.add("is-thrown");
    wrap.current?.style.setProperty("--pk-k", "1");
    if (row.current)
      row.current.style.transform = `translate3d(${(dx < 0 ? -1 : 1) * 112}%,0,0)`;
    onSwipe?.(side);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.button != null && e.button > 0) || done || !swipes) return;
    // A second finger while one is down is not a second swipe.
    if (G.current) return;
    // the check ring, a lead's own button and the action stay taps
    const b = (e.target as HTMLElement).closest?.("button, a, input, textarea");
    if (b && !b.classList.contains("pk-row-open")) return;
    const d: Drag = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      kind: null,
      armed: null,
      s: [[performance.now(), e.clientX]],
      dx: 0,
      off: () => undefined,
    };
    G.current = d;
    d.off = pkTrack(move, end, e.pointerId);
  };

  // a swipe is not a tap
  const click = (e: React.MouseEvent) => {
    if (performance.now() - ended.current < 300) {
      e.preventDefault();
      return;
    }
    onOpen?.();
  };

  const body = (
    <>
      <span className="pk-row-main">
        <span className="pk-row-title">{title}</span>
        {meta ? <span className="pk-row-meta">{meta}</span> : null}
      </span>
      {time ? <span className="pk-row-time">{time}</span> : null}
    </>
  );

  return (
    <div
      ref={wrap}
      className={pkCx("pk-rw", out && "is-out", armed && "is-armed")}
      data-pk-row={id}
    >
      <div className="pk-rw-in">
        {phase === "check" || phase === "done" ? <PkSweep kind="row" /> : null}
        {swipes ? (
          <>
            <div className={`pk-reveal is-done ${plate}`} aria-hidden="true">
              <span className="pk-reveal-mark">
                {doneIcon ?? <LuCheck size={18} />}
              </span>
              <span className="pk-reveal-word">{doneLabel ?? "Done"}</span>
            </div>
            <div className="pk-reveal is-later" aria-hidden="true">
              <span className="pk-reveal-word">{laterLabel ?? "Tomorrow"}</span>
              <span className="pk-reveal-mark">
                {laterIcon ?? <LuArrowRight size={18} />}
              </span>
            </div>
          </>
        ) : null}
        <div
          ref={row}
          className={pkCx(
            "pk-row",
            done && "is-done",
            late && "is-late",
            check === false && !lead && "is-flat"
          )}
          onPointerDown={onPointerDown}
        >
          {lead ??
            (check === false ? null : (
              <button
                type="button"
                className={pkCx(
                  "pk-check",
                  done && "is-on",
                  phase === "check" && "is-ticking"
                )}
                aria-pressed={done}
                aria-label={done ? "Mark not done" : "Mark done"}
                onClick={(e) => {
                  e.stopPropagation();
                  onCheck?.();
                }}
              >
                <span className="pk-check-ring">
                  {done ? <LuCheck size={13} /> : null}
                </span>
              </button>
            ))}
          {onOpen ? (
            <button
              type="button"
              className="pk-row-open"
              onClick={click}
              aria-label={label}
            >
              {body}
            </button>
          ) : (
            <span className="pk-row-open is-static">{body}</span>
          )}
          {action ? <span className="pk-row-act">{action}</span> : null}
        </div>
      </div>
    </div>
  );
}

export interface PkTaskRowProps {
  t: V3Task;
  /** The task's project, resolved by the screen (name and colour). */
  project?: { name: string; color: string | null } | null;
  late?: boolean;
  phase?: PkRowProps["phase"];
  out?: boolean;
  canDone?: boolean;
  canLater?: boolean;
  onCheck?: (t: V3Task) => void;
  onOpen?: (t: V3Task) => void;
  onSwipe?: (side: SwipeSide) => void;
  /** Inside a project's own page the project is not repeated. */
  hideProject?: boolean;
  action?: ReactNode;
}

/**
 * PkRow for a task (`V3Task`): since / duration / project as meta, the time
 * on the right.
 * //todo: the clip count when a task has attachments (`TaskAttachment` is
 * migration M2 and has no route, so V3Task carries none).
 */
export function PkTaskRow({
  t,
  project,
  late,
  phase,
  out,
  canDone,
  canLater,
  onCheck,
  onOpen,
  onSwipe,
  hideProject,
  action,
}: PkTaskRowProps) {
  const h = hourAt(t);
  const time = h != null ? clock(h) : null;
  const line = [
    late ? `Since ${dueLabel(t) ?? ""}`.trim() : null,
    durLabel(t.estimatedMinutes) || null,
  ]
    .filter(Boolean)
    .join(" · ");
  const proj = hideProject ? null : project;
  const meta =
    line || proj ? (
      <>
        {late ? <span className="pk-alert-dot" /> : null}
        {line ? <span>{line}</span> : null}
        {proj ? (
          <span className="pk-row-proj">
            <span
              className="pk-hue"
              style={
                {
                  "--hue": proj.color ?? "var(--text-muted)",
                } as React.CSSProperties
              }
            />
            {proj.name}
          </span>
        ) : null}
      </>
    ) : null;
  return (
    <PkRow
      id={t.id}
      title={t.title}
      meta={meta}
      time={time}
      done={t.done}
      late={late}
      phase={phase}
      out={out}
      canDone={canDone}
      canLater={canLater}
      action={action}
      onCheck={() => onCheck?.(t)}
      onOpen={onOpen ? () => onOpen(t) : undefined}
      onSwipe={onSwipe}
    />
  );
}

/** A clip count chip, for rows that carry attachments (callers that have them). */
export function PkClip({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span
      className="pk-row-clip"
      aria-label={`${count} ${count === 1 ? "attachment" : "attachments"}`}
    >
      <LuPaperclip size={12} />
      {count}
    </span>
  );
}

/* A row leaves in steps: (check shows / thrown off the edge) → folds shut →
   commit(t, kind) writes the change (and the numbers roll). */
const HOLD_CHECK = 360;
const HOLD_THROWN = 190;
// the fade-and-clip of a removed row (opacity + clip-path, motion.css)
const FOLD_MS = 180;

type ExitKind = "check" | "done" | "later";

function without<V>(m: Record<string, V>, key: string) {
  const n = { ...m };
  delete n[key];
  return n;
}

export function usePkExit<T extends { id: string }>(
  commit: (t: T, kind: ExitKind) => void
) {
  const [phase, setPhase] = useState<Record<string, ExitKind>>({});
  const [out, setOut] = useState<Record<string, 1>>({});
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const timers = useRef<number[]>([]);
  const busy = useRef<Record<string, 1>>({});

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, []);

  const exit = useCallback((t: T, kind: ExitKind) => {
    if (busy.current[t.id]) return;
    if (pkReduced()) {
      commitRef.current(t, kind);
      return;
    }
    busy.current[t.id] = 1;
    setPhase((m) => ({ ...m, [t.id]: kind }));
    const hold = kind === "check" ? HOLD_CHECK : HOLD_THROWN;
    timers.current.push(
      window.setTimeout(() => setOut((m) => ({ ...m, [t.id]: 1 })), hold),
      window.setTimeout(() => {
        commitRef.current(t, kind);
        delete busy.current[t.id];
        setPhase((m) => without(m, t.id));
        setOut((m) => without(m, t.id));
      }, hold + FOLD_MS)
    );
  }, []);

  return { phase, out, exit };
}

export { SWIPE_AT };
