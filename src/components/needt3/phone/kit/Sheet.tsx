"use client";

import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

import {
  type MorphRect,
  type Sample,
  firstStop,
  footerPin,
  morphClip,
  pushSample,
  sheetOffset,
  sheetRestStop,
  sheetSettle,
  sheetStops,
  velocity,
} from "@/lib/needt3/gesture";
import { springStep } from "@/lib/needt3/spring";

import { PkScrim } from "./Scrim";
import {
  focusablesIn,
  stackIsTop,
  stackPush,
  stackRemove,
  trapTab,
} from "./focus";
import { type EndReason, onGestureAbort, pkTrack } from "./pointer";
import { usePkInverse } from "./theme";
import { pkClamp, pkCx, pkMarkMoving, pkReduced } from "./util";

/** A rect in the sheet layer's px, or a function that measures it (menu A's pill). */
export type SheetFrom =
  | MorphRect
  | ((layer: HTMLElement | null) => MorphRect | null)
  | null;

export interface PkSheetProps {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  meta?: ReactNode;
  head?: ReactNode;
  footer?: ReactNode;
  /** Fractions of the screen height, e.g. [0.5, 0.92] (opens at the first). Without them the sheet fits its content up to 92%. */
  detents?: readonly number[];
  label?: string;
  className?: string;
  bodyClass?: string;
  /** The sheet grows out of this rect and goes back into it. A drag still closes by sliding. */
  from?: SheetFrom;
  /** Called once the sheet is fully put away (after the slide or the morph back). */
  onShut?: () => void;
  children?: ReactNode;
}

interface SheetState {
  y: { x: number; v: number };
  target: number;
  raf: number;
  last: number;
  H: number;
  FH: number;
  drag: Drag | null;
  open: boolean;
  wasHidden: boolean;
  ds: readonly number[] | null;
  pin: number;
  pinned: boolean;
  m: {
    k: { x: number; v: number };
    raf: number;
    rect: MorphRect | null;
  };
}
interface Drag {
  x0: number;
  y0: number;
  base: number;
  kind: "drag" | "none" | null;
  inBody: boolean;
  s: Sample[];
}

const SHUT_FROM_START = 9999;

/**
 * A frosted sheet over a scrim that blurs the screen, stronger at the edges.
 * `y` = how far the sheet sits below its open position, in px: open is the
 * first detent (or 0 when it fits its content), shut is its height + 24. A
 * drag follows the finger 1:1 downward and meets a rubber band upward past
 * the highest detent; letting go projects the finger's speed and settles on
 * the nearest detent — or shut, which calls `onClose`. Only `transform`,
 * `clip-path` and a custom property are written, through refs; the spring
 * never goes through React state.
 */
export function PkSheet({
  open,
  onClose,
  title,
  meta,
  head,
  footer,
  detents,
  label,
  className,
  bodyClass,
  from,
  onShut,
  children,
}: PkSheetProps) {
  const layer = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const bodyEl = useRef<HTMLDivElement>(null);
  const footEl = useRef<HTMLDivElement>(null);
  const morphEl = useRef<HTMLSpanElement>(null);
  const plateCls = usePkInverse();
  const fromRef = useRef(from);
  fromRef.current = from;
  const shutRef = useRef(onShut);
  shutRef.current = onShut;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const S = useRef<SheetState>({
    y: { x: SHUT_FROM_START, v: 0 },
    target: SHUT_FROM_START,
    raf: 0,
    last: 0,
    H: 0,
    FH: 0,
    drag: null,
    open: false,
    wasHidden: true,
    ds: null,
    pin: 0,
    pinned: false,
    m: { k: { x: 1, v: 0 }, raf: 0, rect: null },
  }).current;
  const ds =
    detents && detents.length ? [...detents].sort((a, b) => a - b) : null;
  const dsKey = ds ? ds.join(",") : "";
  S.ds = ds;

  const paint = useCallback(() => {
    const el = sheet.current;
    if (!el) return;
    const y = S.y.x;
    el.style.transform = `translate3d(0,${y.toFixed(1)}px,0)`;
    const k = S.H ? pkClamp(1 - y / (S.H + 24), 0, 1) : 0;
    scrim.current?.style.setProperty("--pk-scrim-k", k.toFixed(3));
    const hidden = y >= S.H + 23 && !S.open && !S.drag && !S.m.raf;
    if (layer.current) {
      layer.current.style.visibility = hidden ? "hidden" : "visible";
      layer.current.setAttribute("data-pk-y", String(Math.round(y)));
    }
    if (hidden !== S.wasHidden) {
      S.wasHidden = hidden;
      if (hidden) shutRef.current?.();
    }
    // At a lower detent the sheet's bottom is below the screen: the footer
    // rides up to stay on screen (down to the lowest detent; past it, while
    // closing, it leaves with the sheet). Per frame this writes the footer's
    // transform only; the body's room for it is a class that flips once when
    // the footer starts or stops riding (the amount is --pk-pin-max, set in
    // measure()), so no layout property is written while it moves.
    const pin = footerPin(y, S.FH, S.ds);
    if (Math.abs(pin - S.pin) > 0.25 || (pin === 0 && S.pin)) {
      S.pin = pin;
      if (footEl.current)
        footEl.current.style.transform = pin
          ? `translate3d(0,${(-pin).toFixed(1)}px,0)`
          : "";
      const pinned = pin > 0.5;
      if (pinned !== S.pinned) {
        S.pinned = pinned;
        footEl.current?.classList.toggle("is-pinned", pinned);
        bodyEl.current?.classList.toggle("has-pin", pinned);
      }
    }
  }, [S]);

  /** The screen's blur bands rest while the sheet moves (one blur at a time). */
  const syncMoving = useCallback(() => {
    pkMarkMoving(
      layer.current,
      !!(S.raf || S.m.raf || (S.drag && S.drag.kind === "drag"))
    );
  }, [S]);

  const run = useCallback(() => {
    if (S.raf) return;
    S.last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.034, (now - S.last) / 1000);
      S.last = now;
      springStep(S.y, S.target, dt, 420, 0.86);
      const still = Math.abs(S.y.x - S.target) < 0.5 && Math.abs(S.y.v) < 8;
      if (still) {
        S.y.x = S.target;
        S.y.v = 0;
        S.raf = 0;
        paint();
        syncMoving();
        return;
      }
      paint();
      S.raf = requestAnimationFrame(tick);
    };
    S.raf = requestAnimationFrame(tick);
    syncMoving();
  }, [S, paint, syncMoving]);

  const go = useCallback(
    (target: number, vel?: number) => {
      S.target = target;
      if (vel != null) S.y.v = vel;
      if (pkReduced()) {
        cancelAnimationFrame(S.raf);
        S.raf = 0;
        S.y.x = target;
        S.y.v = 0;
        paint();
        syncMoving();
        return;
      }
      run();
    },
    [S, paint, run, syncMoving]
  );

  /* The morph (`from`): the sheet grows out of a rect on the screen — menu A's
     pill for the composer — and goes back into it. k 0 = the rect, 1 = the
     sheet; the sheet sits at its open position while the clip and corners
     travel, the plate-coloured wash fades as it grows. */
  const morphPaint = useCallback(() => {
    const el = sheet.current;
    const M = S.m;
    const r = M.rect;
    if (!el) return;
    if (!r || M.k.x >= 0.999) {
      el.style.clipPath = "";
      el.style.setProperty("-webkit-clip-path", "");
      if (morphEl.current) morphEl.current.style.opacity = "0";
      el.style.removeProperty("--pk-morph-k");
      return;
    }
    const k = pkClamp(M.k.x, 0, 1.06);
    const clip = morphClip(k, r, S.H, S.FH, layer.current?.clientWidth ?? 0);
    el.style.clipPath = clip;
    el.style.setProperty("-webkit-clip-path", clip);
    el.style.setProperty(
      "--pk-morph-k",
      pkClamp((k - 0.35) / 0.55, 0, 1).toFixed(3)
    );
    if (morphEl.current)
      morphEl.current.style.opacity = pkClamp(1 - k * 1.3, 0, 1).toFixed(3);
    scrim.current?.style.setProperty(
      "--pk-scrim-k",
      pkClamp(k, 0, 1).toFixed(3)
    );
  }, [S]);

  const morph = useCallback(
    (to: 0 | 1, done?: () => void) => {
      const M = S.m;
      cancelAnimationFrame(M.raf);
      M.raf = 0;
      layer.current?.classList.add("is-morphing");
      let last = performance.now();
      const tick = (now: number) => {
        const dt = Math.min(0.034, (now - last) / 1000);
        last = now;
        const still = springStep(M.k, to, dt, to ? 170 : 380, to ? 0.84 : 1);
        morphPaint();
        if (still || (to === 0 && M.k.x <= 0.002)) {
          M.k.x = to;
          M.k.v = 0;
          M.raf = 0;
          layer.current?.classList.remove("is-morphing");
          morphPaint();
          syncMoving();
          done?.();
          return;
        }
        M.raf = requestAnimationFrame(tick);
      };
      M.raf = requestAnimationFrame(tick);
      syncMoving();
    },
    [S, morphPaint, syncMoving]
  );

  const stopMorph = useCallback(() => {
    const M = S.m;
    cancelAnimationFrame(M.raf);
    M.raf = 0;
    M.rect = null;
    M.k.x = 1;
    layer.current?.classList.remove("is-morphing");
    morphPaint();
    syncMoving();
  }, [S, morphPaint, syncMoving]);

  /* Measure the sheet. A closed sheet (or one on its way down) keeps its shut
     position in step with its height: new detents, or content that grew while
     it was put away, must not leave its top edge peeking over the screen. */
  const measure = useCallback(() => {
    const el = sheet.current;
    const ly = layer.current;
    if (!el || !ly) return;
    const oldShut = S.H + 24;
    const wasShut = !S.open && S.target >= oldShut - 0.5;
    S.FH = ly.clientHeight;
    if (S.ds) el.style.height = `${Math.round(S.ds[S.ds.length - 1] * S.FH)}px`;
    else el.style.height = "";
    S.H = el.offsetHeight;
    ly.style.setProperty(
      "--pk-pin-max",
      `${footerPin(Number.POSITIVE_INFINITY, S.FH, S.ds).toFixed(1)}px`
    );
    if (wasShut && S.H + 24 !== oldShut) {
      S.target = S.H + 24;
      if (!S.raf && !S.m.raf && !S.drag) {
        S.y.x = S.target;
        S.y.v = 0;
        paint();
      }
    }
  }, [S, paint]);

  useLayoutEffect(() => {
    measure();
    const was = S.open;
    S.open = !!open;
    const rectOf = () => {
      const f = fromRef.current;
      const r = typeof f === "function" ? f(layer.current) : f;
      return r && r.w ? r : null;
    };
    if (open) {
      const r = !was && !pkReduced() ? rectOf() : null;
      if (r) {
        // grow out of the rect: at the open position at once, the clip travels
        cancelAnimationFrame(S.raf);
        S.raf = 0;
        S.y.x = S.target = firstStop(S.FH, S.ds);
        S.y.v = 0;
        S.m.rect = r;
        S.m.k.x = 0;
        S.m.k.v = 0;
        paint();
        morphPaint();
        morph(1, () => {
          S.m.rect = null;
          morphPaint();
        });
      } else {
        if (S.y.x > S.H + 24 || S.y.x === SHUT_FROM_START) S.y.x = S.H + 24;
        go(firstStop(S.FH, S.ds));
      }
    } else if (!was || S.y.x >= S.H + 23.5) {
      // already shut (a re-render with other detents): straight to the shut
      // position, nothing slides into view
      cancelAnimationFrame(S.raf);
      S.raf = 0;
      if (S.m.raf) stopMorph();
      S.y.x = S.target = S.H + 24;
      S.y.v = 0;
      paint();
    } else {
      // closed by a tap, Esc or the primary action while it sits open: back
      // into the rect; closed by a drag: it slides
      const r = was && !pkReduced() && S.y.x < 40 && !S.drag ? rectOf() : null;
      if (r) {
        cancelAnimationFrame(S.raf);
        S.raf = 0;
        S.m.rect = r;
        if (!S.m.raf) {
          S.m.k.x = 1;
          S.m.k.v = 0;
        }
        morph(0, () => {
          S.m.rect = null;
          S.y.x = S.target = S.H + 24;
          S.y.v = 0;
          S.m.k.x = 1;
          morphPaint();
          paint();
        });
      } else {
        if (S.m.raf) stopMorph();
        go(S.H + 24);
      }
    }
    // measure / paint / go / morph are stable; the effect is about open + detents
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dsKey]);

  useLayoutEffect(() => {
    const el = sheet.current;
    if (!el || typeof ResizeObserver !== "function") return undefined;
    const ro = new ResizeObserver(() => {
      measure();
      if (!S.open && !S.raf) {
        S.y.x = S.target = S.H + 24;
        paint();
      }
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(S.raf);
      S.raf = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dsKey]);

  /* Focus and stacking. When the sheet opens: remember who had the focus,
     join the stack, and move the focus in after the first paint (not inside the
     layout effect, where the sheet is still off screen). Esc and the Tab trap
     answer only for the top sheet; closing puts the focus back where it was. */
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement as HTMLElement | null;
    const id = stackPush();
    const sheetEl = sheet.current;
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        const el = sheet.current;
        if (!el || !stackIsTop(id)) return;
        // already inside (an autofocus field of its own): leave it
        if (el.contains(document.activeElement)) return;
        const first = focusablesIn(el.querySelector(".pk-sheet-body") ?? el)[0];
        try {
          (first ?? el).focus({ preventScroll: true });
        } catch {
          /* an old engine */
        }
      });
    });
    const k = (e: KeyboardEvent) => {
      if (!stackIsTop(id)) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (sheet.current) trapTab(e, sheet.current);
    };
    window.addEventListener("keydown", k);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", k);
      stackRemove(id);
      // back to the opener, unless the person already moved on
      const here = document.activeElement;
      if (
        opener &&
        opener.isConnected &&
        (!here || here === document.body || (sheetEl && sheetEl.contains(here)))
      ) {
        try {
          opener.focus({ preventScroll: true });
        } catch {
          /* gone */
        }
      }
    };
  }, [open]);

  useEffect(() => {
    const m = S.m;
    return () => {
      cancelAnimationFrame(S.raf);
      cancelAnimationFrame(m.raf);
    };
  }, [S]);

  const begin = (x: number, y: number, inBody: boolean) => {
    S.drag = {
      x0: x,
      y0: y,
      base: S.y.x,
      kind: null,
      inBody,
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
      // in the body, only a downward drag from the top of its scroll
      if (
        d.inBody &&
        (dy < 0 || (bodyEl.current && bodyEl.current.scrollTop > 0))
      ) {
        d.kind = "none";
        return;
      }
      d.kind = "drag";
      cancelAnimationFrame(S.raf);
      S.raf = 0;
      if (S.m.raf) stopMorph();
      layer.current?.classList.add("is-dragging");
      syncMoving();
    }
    if (d.kind !== "drag") return;
    if (ev?.cancelable) ev.preventDefault();
    S.y.x = sheetOffset(d.base + dy);
    S.y.v = 0;
    paint();
  };
  const finish = (reason: EndReason = "up") => {
    const d = S.drag;
    S.drag = null;
    layer.current?.classList.remove("is-dragging");
    if (!d || d.kind !== "drag") {
      syncMoving();
      return;
    }
    // A cancelled drag (a hold took the finger, or the browser cancelled it)
    // goes back to the stop it is nearest and never closes.
    if (reason === "cancel") {
      go(sheetRestStop(S.y.x, sheetStops(S.H, S.FH, S.ds)));
      return;
    }
    const v = velocity(d.s); // px/ms, + down
    const { stop, closes } = sheetSettle(S.y.x, v, sheetStops(S.H, S.FH, S.ds));
    go(stop, pkClamp(v * 1000, -4000, 4000));
    if (closes) closeRef.current?.();
  };
  const mvRef = useRef(moveTo);
  const endRef = useRef<(reason?: EndReason) => void>(finish);
  mvRef.current = moveTo;
  endRef.current = finish;

  const fieldish = (t: EventTarget | null) =>
    !!(t as HTMLElement | null)?.closest?.(
      "input, textarea, select, [contenteditable='true'], .pk-no-drag"
    );
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !S.open ||
      e.pointerType === "touch" ||
      (e.button != null && e.button > 0) ||
      fieldish(e.target)
    )
      return;
    if (S.drag) return;
    begin(e.clientX, e.clientY, !!bodyEl.current?.contains(e.target as Node));
    pkTrack(
      (ev) => mvRef.current(ev.clientX, ev.clientY, ev),
      (_ev, reason) => endRef.current(reason),
      e.pointerId
    );
  };
  useEffect(() => {
    const el = sheet.current;
    if (!el) return undefined;
    // The non-passive touchmove (needed to stop the page scrolling under a
    // sheet drag) exists only between a touchstart that could start a drag and
    // its end or cancel.
    const stopTouch = () => {
      el.removeEventListener("touchmove", tm);
      el.removeEventListener("touchend", te);
      el.removeEventListener("touchcancel", tc);
    };
    const ts = (e: TouchEvent) => {
      if (!S.open || S.drag || e.touches.length !== 1 || fieldish(e.target))
        return;
      const inBody = !!bodyEl.current?.contains(e.target as Node);
      begin(e.touches[0].clientX, e.touches[0].clientY, inBody);
      // a scrolled body scrolls: only a touch that can drag the sheet holds
      // the scroll thread with a non-passive listener
      if (!inBody || (bodyEl.current?.scrollTop ?? 0) <= 0)
        el.addEventListener("touchmove", tm, { passive: false });
      el.addEventListener("touchend", te);
      el.addEventListener("touchcancel", tc);
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
    // A hold has fired: let go of the finger without closing or moving.
    const offAbort = onGestureAbort(() => {
      if (S.drag) endRef.current("cancel");
    });
    el.addEventListener("touchstart", ts, { passive: true });
    return () => {
      offAbort();
      stopTouch();
      el.removeEventListener("touchstart", ts);
    };
    // begin / S are stable for the life of the component
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // a drag is not a tap
  const swallow = (e: React.MouseEvent) => {
    const d = S.drag;
    if (d && d.kind === "drag") {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return (
    <div
      ref={layer}
      className={pkCx("pk-sheet-layer", open && "is-open")}
      inert={open ? undefined : true}
      data-pk-sheet={open ? "open" : "shut"}
    >
      <PkScrim scrimRef={scrim} open={open} onClick={() => onClose?.()} />
      <div
        ref={sheet}
        className={pkCx("pk-sheet", className)}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === "string" ? title : undefined)}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onClickCapture={swallow}
      >
        {from ? (
          <span
            ref={morphEl}
            className={`pk-sheet-morph ${plateCls}`}
            aria-hidden="true"
          />
        ) : null}
        <span className="pk-sheet-grab" aria-hidden="true" />
        {head ?? null}
        {title ? (
          <header className="pk-sheet-head">
            <span className="pk-sheet-title">{title}</span>
            {meta ? <span className="pk-sheet-meta">{meta}</span> : null}
          </header>
        ) : null}
        <div ref={bodyEl} className={pkCx("pk-sheet-body", bodyClass)}>
          {children}
        </div>
        {footer ? (
          <div ref={footEl} className="pk-sheet-foot">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
