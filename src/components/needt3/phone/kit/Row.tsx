"use client";

import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  LuArrowRight,
  LuCalendar,
  LuCheck,
  LuPaperclip,
  LuTrash2,
} from "react-icons/lu";

import { clock, durLabel } from "@/lib/needt3/day";
import { dueLabel, at as hourAt } from "@/lib/needt3/derive";
import {
  ACTIONS_SNAP_AT,
  ACTIONS_W,
  SWIPE_AT,
  type Sample,
  type SwipeSide,
  actionsOffset,
  actionsReveal,
  actionsSettle,
  axisOf,
  pushSample,
  sideOf,
  swipeArmed,
  swipeOffset,
  swipeRelease,
  swipeReveal,
  velocity,
} from "@/lib/needt3/gesture";
import { haptic } from "@/lib/needt3/haptics";
import type { V3Task } from "@/lib/needt3/map";

import { type CloseWithStep, PhoneStepsSlot } from "../../task/TaskSteps";
import { PkSweep } from "./Material";
import { type EndReason, frameWriter, pkTrack } from "./pointer";
import { usePkPlate } from "./theme";
import { pkCx, pkReduced } from "./util";

/** A row that opens one swipe left was opened: the others shut. */
const OPENED = "pk-row-opened";

interface Drag {
  id: number;
  x0: number;
  y0: number;
  kind: "swipe" | "none" | null;
  armed: SwipeSide | null;
  /** Past the point where a closed row would settle open. */
  snap: boolean;
  /** Where the row rested when the finger came down: 0, or -ACTIONS_W. */
  base: number;
  /** The row's logical offset: where it rested plus the finger's travel. */
  raw: number;
  s: Sample[];
  dx: number;
  off: () => void;
}

/** The buttons behind a row, revealed by a swipe left. */
export interface PkRowActions {
  onSchedule?: () => void;
  onDelete?: () => void;
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
  phase?: "check" | "done" | "later" | "trash";
  /** Folds the row shut. */
  out?: boolean;
  canDone?: boolean;
  canLater?: boolean;
  onCheck?: () => void;
  onOpen?: () => void;
  onSwipe?: (side: SwipeSide) => void;
  /**
   * Swipe left shows these buttons (Schedule, Delete) and the row rests open,
   * instead of throwing the row off the edge as "later".
   */
  actions?: PkRowActions;
  doneLabel?: string;
  laterLabel?: string;
  doneIcon?: ReactNode;
  laterIcon?: ReactNode;
  /** `false` drops the check ring (event rows). */
  check?: boolean;
  /** Under the row, outside the swipe layer (a task's steps). */
  below?: ReactNode;
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
  actions,
  doneLabel,
  laterLabel,
  doneIcon,
  laterIcon,
  check,
  below,
}: PkRowProps) {
  const plate = usePkPlate();
  const wrap = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const G = useRef<Drag | null>(null);
  const ended = useRef(Number.NEGATIVE_INFINITY);
  const frame = useRef(frameWriter());
  const [armed, setArmed] = useState<SwipeSide | null>(null);
  const [open, setOpen] = useState(false);
  const [thrown, setThrown] = useState(false);
  const openRef = useRef(false);
  const done = !!doneIn || phase === "check";
  const leftActions = !!(actions && (actions.onSchedule || actions.onDelete));
  const allow = {
    canDone: !!canDone && !!onSwipe,
    canLater: leftActions ? false : canLater,
  };
  const swipes = leftActions || (!!onSwipe && (canDone || canLater));

  useEffect(() => {
    const w = frame.current;
    return () => {
      w.cancel();
      G.current?.off();
    };
  }, []);

  const set = (x: number, k: number, side: SwipeSide | "actions" | null) => {
    if (row.current)
      row.current.style.transform = x
        ? `translate3d(${x.toFixed(1)}px,0,0)`
        : "";
    if (wrap.current) {
      wrap.current.style.setProperty("--pk-k", k.toFixed(3));
      wrap.current.setAttribute("data-pk-side", side ?? "");
    }
  };

  /** The row rests open (the buttons show) or shut. */
  const rest = (on: boolean) => {
    const was = openRef.current;
    openRef.current = on;
    setOpen(on);
    set(on ? -ACTIONS_W : 0, on ? 1 : 0, on ? "actions" : null);
    if (on && !was)
      window.dispatchEvent(new CustomEvent(OPENED, { detail: id }));
  };

  // An open row shuts on a touch anywhere else, on a scroll, and when another
  // row opens.
  useEffect(() => {
    if (!open) return undefined;
    const outside = (e: Event) => {
      if (!wrap.current?.contains(e.target as Node)) rest(false);
    };
    const other = (e: Event) => {
      if ((e as CustomEvent).detail !== id) rest(false);
    };
    const scrolled = () => rest(false);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener(OPENED, other);
    window.addEventListener("scroll", scrolled, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener(OPENED, other);
      window.removeEventListener("scroll", scrolled, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);

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
    const raw = d.base + dx;
    d.raw = raw;
    if (leftActions && raw < 0) {
      frame.current.schedule(() =>
        set(actionsOffset(raw), actionsReveal(raw), "actions")
      );
      const snap = raw <= -ACTIONS_SNAP_AT;
      if (snap !== d.snap) {
        d.snap = snap;
        if (snap && !openRef.current) haptic("tick");
      }
      if (d.armed) {
        d.armed = null;
        setArmed(null);
      }
      return;
    }
    d.snap = false;
    frame.current.schedule(() =>
      set(swipeOffset(raw, allow), swipeReveal(raw, allow), sideOf(raw))
    );
    const next = swipeArmed(raw, allow);
    if (next !== d.armed) {
      d.armed = next;
      setArmed(next);
      if (next) haptic("tick");
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
    const raw = d.raw;
    setArmed(null);
    if (leftActions && raw < 0) {
      // Rests where it settles: open past the snap point or on a flick left,
      // else shut. A cancel keeps what it was.
      rest(
        reason === "cancel"
          ? openRef.current
          : actionsSettle(raw, velocity(d.s), openRef.current)
      );
      return;
    }
    const side = swipeRelease(reason, raw, velocity(d.s), allow);
    if (!side) {
      rest(false);
      return;
    }
    // Thrown: off the edge, then the parent folds the row away and commits.
    openRef.current = false;
    setOpen(false);
    setThrown(true);
    haptic("success");
    wrap.current?.style.setProperty("--pk-k", "1");
    if (row.current)
      row.current.style.transform = `translate3d(${(raw < 0 ? -1 : 1) * 112}%,0,0)`;
    onSwipe?.(side);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.button != null && e.button > 0) || done || !swipes) return;
    // A second finger while one is down is not a second swipe.
    if (G.current) return;
    // the check ring, a lead's own button and the action stay taps
    const b = (e.target as HTMLElement).closest?.("button, a, input, textarea");
    if (b && !b.classList.contains("pk-row-open")) return;
    const base = openRef.current ? -ACTIONS_W : 0;
    const d: Drag = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      kind: null,
      armed: null,
      snap: false,
      base,
      raw: base,
      s: [[performance.now(), e.clientX]],
      dx: 0,
      off: () => undefined,
    };
    G.current = d;
    d.off = pkTrack(move, end, e.pointerId);
  };

  /** Schedule: shut the row, then the parent opens its date picker. */
  const schedule = () => {
    rest(false);
    actions?.onSchedule?.();
  };
  /** Delete: the row leaves off the edge; the parent folds it and trashes it. */
  const remove = () => {
    openRef.current = false;
    setOpen(false);
    setThrown(true);
    haptic("success");
    wrap.current?.style.setProperty("--pk-k", "1");
    if (row.current) row.current.style.transform = "translate3d(-112%,0,0)";
    actions?.onDelete?.();
  };

  // a swipe is not a tap
  const click = (e: React.MouseEvent) => {
    if (performance.now() - ended.current < 300) {
      e.preventDefault();
      return;
    }
    // a tap on a row that rests open shuts it instead of opening the task
    if (openRef.current) {
      e.preventDefault();
      rest(false);
      return;
    }
    onOpen?.();
  };

  const body = (
    <>
      <span className="pk-row-main">
        <span className="pk-row-title" title={title}>
          {title}
        </span>
        {meta ? <span className="pk-row-meta">{meta}</span> : null}
      </span>
      {time ? <span className="pk-row-time">{time}</span> : null}
    </>
  );

  return (
    <div
      ref={wrap}
      className={pkCx(
        "pk-rw",
        out && "is-out",
        armed && "is-armed",
        open && "is-open",
        thrown && "is-thrown"
      )}
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
            {leftActions ? (
              <div className="pk-actions" aria-hidden={!open}>
                {actions?.onSchedule ? (
                  <button
                    type="button"
                    className="pk-act is-schedule"
                    tabIndex={open ? 0 : -1}
                    onClick={schedule}
                  >
                    <LuCalendar size={18} aria-hidden="true" />
                    <span>Schedule</span>
                  </button>
                ) : null}
                {actions?.onDelete ? (
                  <button
                    type="button"
                    className="pk-act is-delete"
                    tabIndex={open ? 0 : -1}
                    onClick={remove}
                  >
                    <LuTrash2 size={18} aria-hidden="true" />
                    <span>Delete</span>
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="pk-reveal is-later" aria-hidden="true">
                <span className="pk-reveal-word">
                  {laterLabel ?? "Tomorrow"}
                </span>
                <span className="pk-reveal-mark">
                  {laterIcon ?? <LuArrowRight size={18} />}
                </span>
              </div>
            )}
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
                  if (!done) haptic("success");
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
      {below}
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
  /** Swipe left shows Schedule / Delete (see `PkRowActions`). */
  actions?: PkRowActions;
  /** Inside a project's own page the project is not repeated. */
  hideProject?: boolean;
  /** A project page draws the steps itself: the row keeps only its count. */
  hideSteps?: boolean;
  /** The last step ticked closes the task: close it as the row's own tick does. */
  onStepClose?: CloseWithStep;
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
  actions,
  hideProject,
  hideSteps,
  onStepClose,
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
      actions={actions}
      below={
        <PhoneStepsSlot task={t} hideSteps={hideSteps} close={onStepClose} />
      }
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

type ExitKind = "check" | "done" | "later" | "trash";

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
