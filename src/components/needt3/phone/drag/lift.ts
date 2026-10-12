/**
 * Long-press a row, lift it, drop it somewhere else (phone-drag.jsx).
 *
 * Long-press (350 ms, a short haptic) lifts a row: the row itself goes up
 * (scale 1.02, a shadow layer, a slight tilt) and follows the finger; its slot
 * stays as the gap, nothing is drawn twice. The rows and section heads between
 * home and the gap slide out of the way (transform only), so the gap travels
 * with the finger, across sections too. Release settles the row into the gap
 * and then commits; release outside the list, a cancelled touch or Esc flies it
 * back. Near the top or bottom edge the list scrolls under the finger.
 * Reduced motion: no tilt, no spring, every move is instant.
 *
 * It never fights the other gestures: before the press fires, moving 7 px
 * gives the touch back (vertical = native scroll, horizontal = the row's
 * swipe); once a row is lifted the swipe, the pull-down and the scroll stand
 * down (`pkOwnGesture` ends their trackers and stops touch scrolling).
 *
 * Performance: one rAF per pointer stream (`frameWriter`: the finger's frame
 * and the edge scroll are the same chain), only `transform` / a custom
 * property written through refs, and no `getBoundingClientRect()` in the
 * pointer path. Rects are read once at the lift; the list's top is then
 * `top₀ − (scrollTop − scrollTop₀)`, and a resize drops the cache.
 *
 * A zone is an element with `data-pd-zone="<key>"` holding a PkSection:
 *   data-pd-mode="move" | "reorder" | "none"   data-pd-folded="1"
 * Rows are PkRow's `[data-pk-row]` (the task id); heads are `.pk-sec-head`.
 */
import { haptic } from "@/lib/needt3/platform";

import { frameWriter, pkOwnGesture } from "../kit/pointer";
import { pkReduced } from "../kit/util";
import type { DropRequest } from "./drop";
import {
  type Candidate,
  type Token,
  type ZoneMode,
  candidates,
  isOut,
  lean,
  nearest,
  scrollSpeed,
  shiftOf,
} from "./geometry";

export const PD_HOLD = 350;
export const PD_SLOP = 7;
const SWALLOW_MS = 400;
const FLY_FALLBACK_MS = 460;

export interface PdOptions {
  canLift?: (id: string) => boolean;
  onDrop?: (r: DropRequest) => void;
}

interface DomToken extends Token {
  el: HTMLElement;
  zoneEl: Element | null;
}

interface Press {
  pid: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  rowEl: HTMLElement;
  id: string;
  container: HTMLElement;
  get: () => PdOptions;
  timer: number;
}

interface Session {
  id: string;
  pid: number;
  from: string | null;
  fromMode: ZoneMode;
  container: HTMLElement;
  scroller: HTMLElement;
  rowEl: HTMLElement;
  layer: HTMLElement;
  card: HTMLElement;
  scale: number;
  calm: boolean;
  x0: number;
  y0: number;
  p: { x: number; y: number };
  lastX: number;
  lean: number;
  /** The row's client top at the lift. */
  srcClientTop: number;
  /** The list's client top at the lift, and the scroll it was read at. */
  listTop0: number;
  scroll0: number;
  /** The scroller's rect; dropped on resize. */
  scRect: DOMRect | null;
  srcTop: number;
  H: number;
  T: DomToken[];
  si: number;
  cands: Candidate<DomToken>[];
  cand: Candidate<DomToken> | undefined;
  out: boolean;
  overEl: Element | null;
  get: () => PdOptions;
  release: () => void;
}

const PD: {
  press: Press | null;
  s: Session | null;
  swallow: number;
  writer: ReturnType<typeof frameWriter>;
  attached: number;
  off: (() => void) | null;
} = {
  press: null,
  s: null,
  swallow: 0,
  writer: frameWriter(),
  attached: 0,
  off: null,
};

/* ── the tokens a drag moves: section heads, rows, "Show more" ── */
function measure(container: HTMLElement, listTop: number, scale: number) {
  const els = container.querySelectorAll<HTMLElement>(
    ".pk-sec-head, [data-pk-row], .ptk-more"
  );
  const out: DomToken[] = [];
  els.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (!r.height) return;
    const z = el.closest("[data-pd-zone]");
    out.push({
      el,
      kind: el.matches("[data-pk-row]")
        ? "row"
        : el.matches(".pk-sec-head")
          ? "head"
          : "other",
      zone: z ? z.getAttribute("data-pd-zone") : null,
      zoneEl: z,
      mode: z
        ? ((z.getAttribute("data-pd-mode") as ZoneMode | null) ?? "move")
        : "none",
      folded: !!z && z.getAttribute("data-pd-folded") === "1",
      id: el.getAttribute("data-pk-row"),
      top: (r.top - listTop) / scale,
      h: r.height / scale,
    });
  });
  return out;
}

function shift(s: Session, cand: Candidate<DomToken> | undefined) {
  const q = cand && !cand.folded ? cand.q : s.si;
  s.T.forEach((t, k) => {
    const dy = shiftOf(k, s.si, q, s.H);
    if (dy) {
      t.el.setAttribute("data-pd-shift", "");
      t.el.style.transform = `translate3d(0,${dy.toFixed(1)}px,0)`;
    } else if (t.el.hasAttribute("data-pd-shift")) {
      t.el.style.transform = "translate3d(0,0,0)";
    }
  });
}

function over(s: Session, cand: Candidate<DomToken> | undefined) {
  const head =
    cand && cand.zone !== s.from
      ? s.T.find((t) => t.kind === "head" && t.zone === cand.zone)
      : undefined;
  const el = head ? head.el : null;
  if (s.overEl === el) return;
  s.overEl?.removeAttribute("data-pd-over");
  s.overEl = el;
  el?.setAttribute("data-pd-over", "");
}

/** The list's client top now: read once at the lift, then moved by the scroll. */
const listTop = (s: Session) => s.listTop0 - (s.scroller.scrollTop - s.scroll0);

/** One frame of the finger (and, near an edge, of the scroll: the same chain). */
function frame(s: Session) {
  if (PD.s !== s) return;
  const p = s.p;
  const dx = (p.x - s.x0) / s.scale;
  const dy = (p.y - s.y0) / s.scale;
  s.lean = s.calm ? 0 : lean(s.lean, p.x - s.lastX);
  s.lastX = p.x;
  s.layer.style.transform = `translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,0)`;
  s.card.style.setProperty(
    "--pd-lean",
    `${(s.calm ? 0 : -1 + s.lean).toFixed(2)}deg`
  );
  const sc = (s.scRect ??= s.scroller.getBoundingClientRect());
  s.out = isOut(p.x, p.y, sc);
  const cy = (s.srcClientTop + (p.y - s.y0) - listTop(s)) / s.scale + s.H / 2;
  const cand = nearest(s.cands, cy, s.out);
  if (cand !== s.cand) {
    s.cand = cand;
    shift(s, cand);
    over(s, s.out ? undefined : cand);
  }
  s.layer.classList.toggle("is-out", s.out);

  // Near an edge the list scrolls under the finger; the next frame follows.
  const v = scrollSpeed(p.y, sc.top, sc.bottom);
  if (v) {
    const before = s.scroller.scrollTop;
    s.scroller.scrollTop = before + v;
    if (s.scroller.scrollTop !== before) PD.writer.schedule(() => frame(s));
  }
}

/* ── press → lift ── */
function cancelPress() {
  const P = PD.press;
  if (!P) return;
  PD.press = null;
  window.clearTimeout(P.timer);
  P.rowEl.removeAttribute("data-pd-press");
}

function lift() {
  const P = PD.press;
  if (!P) return;
  PD.press = null;
  P.rowEl.removeAttribute("data-pd-press");
  const { rowEl, container } = P;
  if (!rowEl.isConnected) return;
  const screen =
    (container.closest(".pk-screen") as HTMLElement | null) ??
    container.parentElement;
  const scroller =
    (container.closest(".pk-scroll") as HTMLElement | null) ??
    container.parentElement;
  if (!screen || !scroller) return;
  const sr = screen.getBoundingClientRect();
  const cr = container.getBoundingClientRect();
  const rr = rowEl.getBoundingClientRect();
  const scale = screen.offsetWidth ? sr.width / screen.offsetWidth : 1;
  const tokens = measure(container, cr.top, scale);
  const srcI = tokens.findIndex((t) => t.el === rowEl);
  if (srcI < 0) return;
  const src = tokens[srcI];
  haptic("medium");
  try {
    window.getSelection()?.removeAllRanges();
  } catch {
    /* nothing selected */
  }
  const calm = pkReduced();

  // The lifted copy: layer (the finger's offset) > card (tilt, scale) >
  // [shadow layer, clip > the row's clone]. Nothing is drawn twice: the
  // source row stays in the list as the gap.
  const layer = document.createElement("div");
  layer.className = "pd-lift";
  layer.setAttribute("aria-hidden", "true");
  layer.style.left = `${((rr.left - sr.left) / scale).toFixed(1)}px`;
  layer.style.top = `${((rr.top - sr.top) / scale).toFixed(1)}px`;
  layer.style.width = `${(rr.width / scale).toFixed(1)}px`;
  const card = document.createElement("div");
  card.className = "pd-lift-card";
  const shadow = document.createElement("div");
  shadow.className = "pd-lift-shadow";
  const clip = document.createElement("div");
  clip.className = "pd-lift-clip";
  const clone = rowEl.cloneNode(true) as HTMLElement;
  clone.removeAttribute("data-pk-row");
  clone.removeAttribute("data-pd-press");
  clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  clip.appendChild(clone);
  card.append(shadow, clip);
  layer.appendChild(card);
  screen.appendChild(layer);
  rowEl.setAttribute("data-pd-slot", "");
  document.documentElement.classList.add("is-pd-drag");

  // The screen's own trackers (row swipe, pull-down) end here, and touch
  // scrolling stops, before the session exists (so our own cancel handler,
  // listening on the same window, does not read it as ours).
  const release = pkOwnGesture(P.pid);

  const others = tokens.filter((t) => t !== src);
  const s: Session = {
    id: P.id,
    pid: P.pid,
    from: src.zone,
    fromMode: src.mode,
    container,
    scroller,
    rowEl,
    layer,
    card,
    scale,
    calm,
    x0: P.x0,
    y0: P.y0,
    p: { x: P.x, y: P.y },
    lastX: P.x,
    lean: 0,
    srcClientTop: rr.top,
    listTop0: cr.top,
    scroll0: scroller.scrollTop,
    scRect: null,
    srcTop: src.top,
    H: src.h,
    T: others,
    si: srcI,
    cands: [],
    cand: undefined,
    out: false,
    overEl: null,
    get: P.get,
    release,
  };
  s.cands = candidates({
    T: others,
    si: srcI,
    H: s.H,
    srcTop: s.srcTop,
    from: s.from,
    fromMode: s.fromMode,
  });
  PD.s = s;
  frame(s);
  requestAnimationFrame(() => {
    if (PD.s === s) card.classList.add("is-up");
  });
}

/* ── release ── */
function cleanup(s: Session) {
  s.overEl?.removeAttribute("data-pd-over");
  s.T.forEach((t) => {
    if (t.el.hasAttribute("data-pd-shift")) {
      t.el.removeAttribute("data-pd-shift");
      t.el.style.transform = "";
    }
  });
  s.rowEl.removeAttribute("data-pd-slot");
  s.layer.remove();
  s.release();
  if (!PD.s) document.documentElement.classList.remove("is-pd-drag");
}

/** The lifted copy travels to (dx, dy) on the CSS spring, then `done`. */
function fly(
  s: Session,
  dx: number,
  dy: number,
  done: () => void,
  fade?: boolean
) {
  if (s.calm) {
    done();
    return;
  }
  s.layer.classList.add("is-settling");
  if (fade) s.layer.classList.add("is-fading");
  s.card.classList.remove("is-up");
  s.card.style.setProperty("--pd-lean", "0deg");
  s.layer.style.transform = `translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,0)`;
  let fired = false;
  const fin = () => {
    if (fired) return;
    fired = true;
    done();
  };
  s.layer.addEventListener("transitionend", (e) => {
    if (e.target === s.layer && e.propertyName === "transform") fin();
  });
  window.setTimeout(fin, FLY_FALLBACK_MS);
}

/**
 * After the write the list re-renders. If the row is not exactly where the gap
 * was (a sorted list keeps its sort), it travels there from the gap (FLIP:
 * one rect read, after the drop, never in the pointer path).
 */
function settle(container: HTMLElement, id: string, fromClientTop: number) {
  if (pkReduced()) return;
  const el = Array.from(
    container.querySelectorAll<HTMLElement>("[data-pk-row]")
  ).find((n) => n.getAttribute("data-pk-row") === String(id));
  if (!el) return;
  const dy = fromClientTop - el.getBoundingClientRect().top;
  if (Math.abs(dy) < 2) return;
  el.style.transition = "none";
  el.style.transform = `translate3d(0,${dy.toFixed(1)}px,0)`;
  el.getBoundingClientRect();
  el.setAttribute("data-pd-flip", "");
  el.style.transition = "";
  el.style.transform = "";
  window.setTimeout(() => el.removeAttribute("data-pd-flip"), 420);
}

function end(commit: boolean) {
  const s = PD.s;
  if (!s) return;
  PD.s = null;
  PD.swallow = performance.now() + SWALLOW_MS;
  PD.writer.cancel();
  const cand = commit && !s.out ? s.cand : null;
  if (!cand || cand.home) {
    // back home: a miss, Esc, a drop where it started
    if (s.cand && !s.cand.home) shift(s, undefined);
    over(s, undefined);
    fly(s, 0, 0, () => cleanup(s));
    return;
  }
  const r: DropRequest = {
    id: s.id,
    from: s.from,
    to: cand.zone,
    after: cand.folded ? null : cand.after,
    before: cand.folded ? null : cand.before,
    folded: !!cand.folded,
  };
  const opts = s.get();
  const top = listTop(s);
  if (cand.folded && cand.head) {
    // into a folded section: the row sinks into its header
    const hy = top + cand.head.top * s.scale;
    fly(
      s,
      0,
      (hy - s.srcClientTop) / s.scale,
      () => {
        opts.onDrop?.(r);
        cleanup(s);
      },
      true
    );
    return;
  }
  const landClient = top + cand.gapTop * s.scale;
  fly(s, 0, (landClient - s.srcClientTop) / s.scale, () => {
    let finished = false;
    const tidy = () => {
      if (finished) return;
      finished = true;
      mo.disconnect();
      cleanup(s);
      settle(s.container, s.id, landClient);
    };
    const mo = new MutationObserver(tidy);
    mo.observe(s.container, { childList: true, subtree: true });
    opts.onDrop?.(r);
    requestAnimationFrame(() => requestAnimationFrame(tidy));
  });
}

/* ── the global listeners: capture on window, registered when the first list
   attaches — before any row's swipe or the pull-down attach theirs (those
   register on pointerdown), so a lifted drag can stop their move events. ── */
function listen() {
  const move = (e: PointerEvent) => {
    const P = PD.press;
    if (P && e.pointerId === P.pid) {
      P.x = e.clientX;
      P.y = e.clientY;
      if (
        Math.abs(e.clientX - P.x0) > PD_SLOP ||
        Math.abs(e.clientY - P.y0) > PD_SLOP
      )
        cancelPress();
      return;
    }
    const s = PD.s;
    if (!s || e.pointerId !== s.pid) return;
    e.stopImmediatePropagation();
    if (e.cancelable) e.preventDefault();
    s.p = { x: e.clientX, y: e.clientY };
    PD.writer.schedule(() => frame(s));
  };
  const up = (e: PointerEvent) => {
    if (PD.press && e.pointerId === PD.press.pid) {
      cancelPress();
      return;
    }
    const s = PD.s;
    if (!s || e.pointerId !== s.pid) return;
    s.p = { x: e.clientX, y: e.clientY };
    PD.writer.cancel();
    frame(s);
    end(true);
  };
  const cancel = (e: PointerEvent) => {
    if (PD.press && e.pointerId === PD.press.pid) {
      cancelPress();
      return;
    }
    if (PD.s && e.pointerId === PD.s.pid) end(false);
  };
  const block = (e: Event) => {
    if (PD.press || PD.s) e.preventDefault();
  };
  const noSelect = (e: Event) => {
    if (PD.s) e.preventDefault();
  };
  const click = (e: MouseEvent) => {
    if (performance.now() < PD.swallow) {
      e.stopPropagation();
      e.preventDefault();
    }
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "Escape" && PD.s) {
      e.stopPropagation();
      end(false);
    }
  };
  const blur = () => {
    cancelPress();
    if (PD.s) end(false);
  };
  const resize = () => {
    if (PD.s) PD.s.scRect = null;
  };
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", cancel, true);
  window.addEventListener("contextmenu", block, true);
  window.addEventListener("selectstart", noSelect, true);
  window.addEventListener("click", click, true);
  window.addEventListener("keydown", key, true);
  window.addEventListener("blur", blur);
  window.addEventListener("resize", resize);
  return () => {
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", cancel, true);
    window.removeEventListener("contextmenu", block, true);
    window.removeEventListener("selectstart", noSelect, true);
    window.removeEventListener("click", click, true);
    window.removeEventListener("keydown", key, true);
    window.removeEventListener("blur", blur);
    window.removeEventListener("resize", resize);
  };
}

/** Attach to one list container; returns the detach. */
export function attachPkDrag(container: HTMLElement, get: () => PdOptions) {
  if (!PD.attached++) PD.off = listen();
  const down = (e: PointerEvent) => {
    if (PD.s || PD.press || !e.isPrimary || e.button > 0) return;
    const target = e.target as HTMLElement | null;
    const rowEl = target?.closest<HTMLElement>("[data-pk-row]");
    if (
      !rowEl ||
      !container.contains(rowEl) ||
      !rowEl.closest("[data-pd-zone]")
    )
      return;
    if (target?.closest(".pk-check, .pk-row-act, input, textarea, a, select"))
      return;
    const id = rowEl.getAttribute("data-pk-row");
    if (id == null) return;
    const o = get();
    if (o.canLift && !o.canLift(id)) return;
    PD.press = {
      pid: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      rowEl,
      id,
      container,
      get,
      timer: window.setTimeout(lift, PD_HOLD),
    };
    rowEl.setAttribute("data-pd-press", "");
  };
  container.addEventListener("pointerdown", down);
  return () => {
    container.removeEventListener("pointerdown", down);
    if (PD.press && PD.press.container === container) cancelPress();
    if (PD.s && PD.s.container === container) {
      const s = PD.s;
      PD.s = null;
      PD.writer.cancel();
      cleanup(s);
    }
    if (!--PD.attached) {
      PD.off?.();
      PD.off = null;
    }
  };
}
