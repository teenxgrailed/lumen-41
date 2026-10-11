"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { LuPlus, LuSearch } from "react-icons/lu";

import {
  PULL_ARM,
  type Sample,
  pullOffset,
  pullSettle,
  pushSample,
  velocity,
} from "@/lib/needt3/gesture";
import { springStep } from "@/lib/needt3/spring";

import type { SkyEngine } from "../../scenes";
import { PxSky } from "../../scenes";
import { PkButton } from "./Material";
import { PkScrim } from "./Scrim";
import { type EndReason, onGestureAbort, pkTrack } from "./pointer";
import { usePkPlate, usePkSkyMood } from "./theme";
import { pkCx, pkMarkMoving, pkReduced } from "./util";

export interface PullHit {
  id: string;
  title: string;
  meta?: string;
  done?: boolean;
}

export interface PkPullProps<H extends PullHit = PullHit> {
  /** The screen's scroll container: a pull starts only at its top. */
  scroller: HTMLElement | null;
  /** Hits for a query; the first opens on Enter when there is no `onAdd`. */
  search?: (q: string) => H[];
  onPick?: (hit: H) => void;
  /** Enter adds. Without it the words say "search" and there is no Add button. */
  onAdd?: (text: string) => void;
  placeholder?: string;
  hint?: string;
  addLabel?: (q: string) => string;
}

interface PullState {
  y: { x: number; v: number };
  target: number;
  raf: number;
  last: number;
  H: number;
  drag: Drag | null;
  open: boolean;
  ended: number;
  skyOn: boolean;
  moving: boolean;
}
interface Drag {
  x0: number;
  y0: number;
  kind: "pull" | "none" | null;
  from: "screen" | "plate";
  base: number;
  s: Sample[];
  armed?: boolean;
  cleared?: boolean;
}

/**
 * A plate drops from the top edge with one field — search what is there, or
 * add it. The finger moves it 1:1 to its height, then a rubber band; letting
 * go springs it open or shut. Its position is a `clip-path` and a
 * `translateY` written through a ref each frame; React state is only open,
 * the query and the armed hint. The sky strip along the plate's top draws
 * only while the plate is out (parked while shut).
 */
export function PkPullDown<H extends PullHit = PullHit>({
  scroller,
  search,
  onPick,
  onAdd,
  placeholder,
  hint,
  addLabel,
}: PkPullProps<H>) {
  const plate = usePkPlate();
  const plateEl = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const hintEl = useRef<HTMLSpanElement>(null);
  const S = useRef<PullState>({
    y: { x: 0, v: 0 },
    target: 0,
    raf: 0,
    last: 0,
    H: 220,
    drag: null,
    open: false,
    ended: 0,
    skyOn: false,
    moving: false,
  }).current;
  const skyEng = useRef<SkyEngine | null>(null);
  const sky = usePkSkyMood();
  const [open, setOpenRaw] = useState(false);
  const [q, setQ] = useState("");
  const [armed, setArmed] = useState(false);

  const paint = useCallback(() => {
    const el = plateEl.current;
    if (!el) return;
    const H = S.H;
    const y = Math.max(0, S.y.x);
    const shown = Math.min(y, H);
    const over = Math.max(0, y - H);
    const clip = `inset(0 0 ${(H - shown).toFixed(1)}px 0 round 0 0 34px 34px)`;
    el.style.clipPath = clip;
    el.style.setProperty("-webkit-clip-path", clip);
    el.style.transform = over ? `translateY(${over.toFixed(1)}px)` : "";
    el.style.visibility = y < 0.5 ? "hidden" : "visible";
    // the screen's blur bands rest while the plate moves
    const moving = !!(S.raf || (S.drag && S.drag.kind === "pull"));
    if (moving !== S.moving) {
      S.moving = moving;
      pkMarkMoving(el, moving);
    }
    // the sky strip draws only while the plate is out
    if (y >= 0.5 !== S.skyOn) {
      S.skyOn = y >= 0.5;
      skyEng.current?.park(!S.skyOn);
    }
    const k = Math.min(1, shown / H);
    if (body.current) {
      body.current.style.opacity = Math.min(
        1,
        Math.max(0, (shown - 40) / 70)
      ).toFixed(3);
      body.current.style.transform = `translateY(${((1 - k) * -14).toFixed(1)}px)`;
    }
    scrim.current?.style.setProperty("--pk-scrim-k", k.toFixed(3));
    if (hintEl.current) {
      hintEl.current.style.opacity =
        S.drag && S.drag.kind === "pull" && !S.open
          ? Math.min(1, shown / 60).toFixed(3)
          : "0";
      hintEl.current.style.transform = `translate(-50%,${(Math.max(56, y) + 12).toFixed(1)}px)`;
    }
  }, [S]);

  const run = useCallback(() => {
    if (S.raf) return;
    S.last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.034, (now - S.last) / 1000);
      S.last = now;
      // settle in px: a shut plate is put away (hidden, no hit area) once it
      // is within half a pixel
      const still =
        springStep(S.y, S.target, dt, 380, 0.8) ||
        (Math.abs(S.y.x - S.target) < 0.5 && Math.abs(S.y.v) < 30);
      paint();
      if (still) {
        S.y.x = S.target;
        S.y.v = 0;
        // raf first: paint() reads it to clear the screen's moving flag
        S.raf = 0;
        paint();
        return;
      }
      S.raf = requestAnimationFrame(tick);
    };
    S.raf = requestAnimationFrame(tick);
  }, [S, paint]);

  const setOpen = useCallback(
    (v: boolean, vel?: number) => {
      S.open = v;
      setOpenRaw(v);
      S.target = v ? S.H : 0;
      if (vel != null) S.y.v = vel;
      if (!v) {
        setQ("");
        input.current?.blur();
      }
      if (pkReduced()) {
        S.y.x = S.target;
        S.y.v = 0;
        paint();
        return;
      }
      run();
    },
    [S, paint, run]
  );

  // The plate's height follows what it holds (results come and go).
  useLayoutEffect(() => {
    const el = plateEl.current;
    if (!el) return undefined;
    const m = () => {
      S.H = el.scrollHeight;
      if (S.open && !S.raf && !S.drag) S.y.x = S.target = S.H;
      else if (S.open) S.target = S.H;
      paint();
    };
    m();
    const ro =
      typeof ResizeObserver === "function" ? new ResizeObserver(m) : null;
    if (ro && body.current) ro.observe(body.current);
    return () => {
      ro?.disconnect();
      cancelAnimationFrame(S.raf);
      S.raf = 0;
    };
  }, [S, paint]);

  useEffect(() => {
    if (open && input.current) {
      try {
        input.current.focus({ preventScroll: true });
      } catch {
        input.current.focus();
      }
    }
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, setOpen]);

  /* Gestures. Mouse and pen through pointer events, touch through touch
     events (so a pull at the top can stop the browser's own overscroll). */
  const begin = (x: number, y: number, from: Drag["from"]) => {
    cancelAnimationFrame(S.raf);
    S.raf = 0;
    S.drag = {
      x0: x,
      y0: y,
      kind: null,
      from,
      base: S.y.x,
      s: [[performance.now(), y]],
    };
  };
  const moveTo = (x: number, y: number, ev?: Event) => {
    const d = S.drag;
    if (!d) return;
    const dx = x - d.x0;
    const dy = y - d.y0;
    pushSample(d.s, performance.now(), y);
    if (!d.kind) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) <= Math.abs(dx)) {
        d.kind = "none";
        return;
      }
      d.kind =
        d.from === "plate" || (dy > 0 && (!scroller || scroller.scrollTop <= 0))
          ? "pull"
          : "none";
      if (d.kind !== "pull") {
        if (S.y.x !== S.target) run();
        return;
      }
    }
    if (d.kind !== "pull") return;
    if (ev?.cancelable) ev.preventDefault();
    if (!d.cleared) {
      d.cleared = true;
      try {
        window.getSelection()?.removeAllRanges();
      } catch {
        /* none */
      }
    }
    S.y.x = pullOffset(d.base + dy, S.H);
    S.y.v = 0;
    const a = !S.open && S.y.x >= PULL_ARM;
    if (a !== d.armed) {
      d.armed = a;
      setArmed(a);
    }
    paint();
  };
  const finish = (reason: EndReason = "up") => {
    const d = S.drag;
    S.drag = null;
    if (!d) return;
    if (d.kind) S.ended = performance.now();
    setArmed(false);
    if (d.kind !== "pull") {
      paint();
      return;
    }
    // A cancelled pull (a hold took the finger, or the browser cancelled it)
    // settles where it was resting: it never opens or shuts on the strength of
    // where the finger happened to be.
    if (reason === "cancel") {
      S.target = S.open ? S.H : 0;
      run();
      return;
    }
    const v = velocity(d.s); // px/ms, + down
    const vel = Math.max(-4000, Math.min(4000, v * 1000));
    setOpen(pullSettle(S.open, S.y.x, v, S.H), vel);
  };
  const mvRef = useRef(moveTo);
  const endRef = useRef<(reason?: EndReason) => void>(finish);
  mvRef.current = moveTo;
  endRef.current = finish;

  useEffect(() => {
    const sc = scroller;
    if (!sc) return undefined;
    let off: (() => void) | null = null;
    const pd = (e: PointerEvent) => {
      if (
        e.pointerType === "touch" ||
        (e.button != null && e.button > 0) ||
        S.open ||
        S.drag
      )
        return;
      if (sc.scrollTop > 0) return;
      begin(e.clientX, e.clientY, "screen");
      off = pkTrack(
        (ev) => mvRef.current(ev.clientX, ev.clientY, ev),
        (_ev, reason) => endRef.current(reason),
        e.pointerId
      );
    };
    // Touch: the non-passive touchmove (the only way to stop the browser's own
    // overscroll) exists only between a touchstart at the top of the scroll and
    // its end or cancel; the rest of the time scrolling stays passive.
    const stopTouch = () => {
      sc.removeEventListener("touchmove", tm);
      sc.removeEventListener("touchend", te);
      sc.removeEventListener("touchcancel", tc);
    };
    const ts = (e: TouchEvent) => {
      if (S.open || S.drag || sc.scrollTop > 0 || e.touches.length !== 1)
        return;
      begin(e.touches[0].clientX, e.touches[0].clientY, "screen");
      sc.addEventListener("touchmove", tm, { passive: false });
      sc.addEventListener("touchend", te);
      sc.addEventListener("touchcancel", tc);
    };
    const tm = (e: TouchEvent) => {
      if (S.drag && e.touches.length === 1)
        mvRef.current(e.touches[0].clientX, e.touches[0].clientY, e);
    };
    const te = () => {
      stopTouch();
      if (S.drag) endRef.current("up");
    };
    const tc = () => {
      stopTouch();
      if (S.drag) endRef.current("cancel");
    };
    // A pull is not a tap: the click that follows it is swallowed.
    const ck = (e: Event) => {
      if (performance.now() - S.ended < 300) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    // A hold has fired: let go of the finger without opening or shutting.
    const offAbort = onGestureAbort(() => {
      if (S.drag) endRef.current("cancel");
    });
    sc.addEventListener("pointerdown", pd);
    sc.addEventListener("touchstart", ts, { passive: true });
    sc.addEventListener("click", ck, true);
    return () => {
      off?.();
      offAbort();
      stopTouch();
      sc.removeEventListener("pointerdown", pd);
      sc.removeEventListener("touchstart", ts);
      sc.removeEventListener("click", ck, true);
    };
    // begin / S are stable for the life of the component
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroller]);

  // Dragging the open plate up puts it away.
  const onPlateDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!S.open || (e.button != null && e.button > 0)) return;
    if ((e.target as HTMLElement).closest?.("input, button")) return;
    if (S.drag) return;
    begin(e.clientX, e.clientY, "plate");
    pkTrack(
      (ev) => mvRef.current(ev.clientX, ev.clientY, ev),
      (_ev, reason) => endRef.current(reason),
      e.pointerId
    );
  };

  const query = q.trim();
  const hits = query && search ? search(query) : [];
  // Enter adds; with nothing to add (Mail, Trash …) it opens the first hit.
  const add = () => {
    if (!query) return;
    if (onAdd) {
      onAdd(query);
      setOpen(false);
      return;
    }
    if (hits.length && onPick) {
      setOpen(false);
      onPick(hits[0]);
    }
  };
  const verb = onAdd ? "search or add" : "search";
  const tab = open ? 0 : -1;

  return (
    <>
      <PkScrim scrimRef={scrim} open={open} onClick={() => setOpen(false)} />
      <div
        ref={plateEl}
        className={`pk-pull ${plate}`}
        data-pk-pull={open ? "open" : "shut"}
        aria-hidden={open ? undefined : "true"}
        onPointerDown={onPlateDown}
      >
        <div className="pk-pull-sky" data-px-scope="" aria-hidden="true">
          <PxSky
            horizon="none"
            fps={15}
            mood={sky.mood ?? undefined}
            dark={sky.dark}
            parked
            engine={skyEng}
          />
        </div>
        <div ref={body} className="pk-pull-body">
          <div className="pk-pull-status" />
          <div className="pk-pull-field">
            <LuSearch size={22} aria-hidden />
            <input
              ref={input}
              className="pk-pull-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                placeholder ?? (onAdd ? "Search or add…" : "Search…")
              }
              aria-label={placeholder ?? (onAdd ? "Search or add" : "Search")}
              tabIndex={tab}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              data-pk-pull-input
            />
          </div>
          {hits.length ? (
            <div className="pk-pull-hits">
              {hits.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className={pkCx("pk-pull-hit", h.done && "is-done")}
                  tabIndex={tab}
                  onClick={() => {
                    setOpen(false);
                    onPick?.(h);
                  }}
                >
                  <span className="pk-pull-hit-title">{h.title}</span>
                  {h.meta ? (
                    <span className="pk-pull-hit-meta">{h.meta}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <p className="pk-pull-none">
              {query
                ? "Nothing called that yet."
                : (hint ??
                  (onAdd
                    ? "Tasks, by any word in their title. Enter adds it to today."
                    : "By any word."))}
            </p>
          )}
          <div className="pk-pull-actions">
            <PkButton tabIndex={tab} onClick={() => setOpen(false)}>
              Cancel
            </PkButton>
            {onAdd ? (
              <PkButton
                kind="primary"
                icon={<LuPlus size={18} />}
                tabIndex={tab}
                disabled={!query}
                onClick={add}
                data-pk-pull-add
              >
                {addLabel
                  ? addLabel(query)
                  : query
                    ? `Add “${query}”`
                    : "Add to today"}
              </PkButton>
            ) : null}
          </div>
          <span className="pk-pull-grab" aria-hidden="true" />
        </div>
      </div>
      <span
        ref={hintEl}
        className={pkCx("pk-pull-hint", armed && "is-armed")}
        aria-hidden="true"
      >
        {armed ? `Let go to ${verb}` : `Pull to ${verb}`}
      </span>
    </>
  );
}
