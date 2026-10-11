"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { LuPlus } from "react-icons/lu";

import {
  NVA_HIDE_BELOW,
  type NvaGeom,
  type NvaMode,
  nvaClamp,
  nvaDragKind,
  nvaDragSprings,
  nvaFogK,
  nvaFrame,
  nvaGeom,
  nvaHeadK,
  nvaHint,
  nvaRelease,
  nvaRowK,
  nvaSpringsToTrack,
  nvaTargets,
  nvaTransform,
  nvaUnit,
} from "@/lib/needt3/menu-a";
import {
  NVA_SH_R,
  nvaBoxShadow,
  nvaChainShadow,
  nvaParseShadow,
  nvaShadowEdges,
  nvaShadowPieces,
  nvaShadowPlacement,
} from "@/lib/needt3/menu-shadow";
import { type Spring, springStep } from "@/lib/needt3/spring";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { PxSky } from "../../scenes";
import { type EndReason, frameWriter, pkTrack } from "../kit/pointer";
import { usePkSkyMood } from "../kit/theme";
import { type PkSide, pkReduced } from "../kit/util";
import { MenuGlyph } from "./Glyph";
import { menuFocusMove, menuIsOpen, setInert } from "./a11y";
import { type MenuPlaceId, menuRows, menuWord } from "./places";
import { type MenuCounts, menuBadge, menuStatus } from "./status";

/**
 * Phone menu A, "Card" (prototype nav-a.jsx).
 *
 * At rest: a pill at the bottom, the one object on the screen in the opposite
 * colour, holding your three places and a dot grid that opens the rest. Tap
 * the dots or swipe up and it grows into a card: the three places as tiles on
 * top, then every other place as one large word with what is waiting there
 * underneath. Stops, bottom to top: tucked away to a handle, pill, card, full.
 * Two springs draw it: p (-1 handle, 0 pill, 1 card) and t (card -> full). A
 * finger moves them as one track; letting go projects its velocity and snaps
 * to the nearest stop (`nvaRelease`). Hold the pill, or tap the plus beside
 * it, to capture (the composer, through the UI store).
 *
 * Phone perf fix (docs/port/02-task-plan.md rule 12). Every frame writes only
 * `transform`, `opacity` and the shape's `clip-path` straight to the DOM from
 * a ref, never through React state, and never a size, radius or offset; the
 * list metrics are cached, so a frame reads no layout. The shape is one
 * full-height layer cut by clip-path. The shadow is not a filter on the
 * moving shape: it is pre-drawn box-shadow pieces that only move and stretch.
 * The pill's glass is the one element with a backdrop-filter while anything
 * moves (the fog's, the head's, the tiles' and the create button's blurs step
 * out, see v3-overrides/motion.css P2). One rAF per pointer stream. Reduced
 * motion jumps between stops.
 *
 * Not ported: the in-card Settings list (the prototype's `u` spring and
 * `NvaSettings`): Settings, and the account row, open the Settings sheet via
 * the UI store. The sky behind the three tiles is PxSky at the phone's 15 fps,
 * parked while the menu is a pill.
 */

export interface MenuMe {
  name: string;
  initial: string;
  /** "Free", "Trial · 9d", "Pro". */
  plan: string;
  pro: boolean;
}

export interface MenuProps {
  /** The app theme the menu floats on; the menu itself wears the opposite. */
  side: PkSide;
  /** The place you are in, or null. */
  screen: MenuPlaceId | null;
  /** The pill's three places. */
  tiles: readonly MenuPlaceId[];
  counts: MenuCounts;
  me: MenuMe;
  /** A full-screen layer is up (Ask, a place's cover): the menu steps down and away. */
  away?: boolean;
  /** The composer is growing out of the pill: the pill steps out. */
  morph?: boolean;
  /** A place was chosen (a route, or Ask Needt). Settings goes to onSettings. */
  onPick: (id: MenuPlaceId) => void;
  /** Settings or the account row was chosen. */
  onSettings: () => void;
  /** True at the first moving frame, false once it settles. */
  onMoving?: (moving: boolean) => void;
}

/** A drag in progress. */
interface Gesture {
  id: number;
  x0: number;
  y0: number;
  /** Mode the gesture started in. */
  m: NvaMode;
  scroller: HTMLElement | null;
  s0: number;
  kind: null | "none" | "held" | "scroll" | "drag";
  samples: [number, number][];
  /** Where the card-moving part counts from (+ down). */
  yk: number;
  /** Track position it counts from. */
  px0: number;
  off: (() => void) | null;
}

interface State {
  p: Spring;
  t: Spring;
  tp: number;
  tt: number;
  raf: number;
  last: number;
  g: NvaGeom | null;
  moving: boolean;
  dragging: boolean;
  /** Cached list metrics: rows' height, the list's scrollTop. */
  rowsH: number;
  st: number;
  /** The box the pill's glass is sized to (set once per stop). */
  gw: number;
  gh: number;
  glassHid: boolean;
  gestureEnd: number;
  fadeT: number;
  hold: number;
  hereIdx: number;
  /** The pill ground's alpha for this theme (--nva-pill-alpha). */
  pillAlpha: number;
  hintShown: "more" | "tuck" | null;
  fling: number;
  /** Closed to the pill: focus goes back to the dot grid once it shows (at rest). */
  focusDots: boolean;
}

interface Refs {
  root: HTMLDivElement | null;
  scrim: HTMLDivElement | null;
  glass: HTMLDivElement | null;
  shape: HTMLDivElement | null;
  ground: HTMLDivElement | null;
  content: HTMLDivElement | null;
  grab: HTMLSpanElement | null;
  head: HTMLDivElement | null;
  tiles: HTMLDivElement | null;
  rowsBox: HTMLDivElement | null;
  list: HTMLDivElement | null;
  rows: HTMLDivElement | null;
  fog: HTMLDivElement | null;
  pillbits: HTMLDivElement | null;
  dots: HTMLButtonElement | null;
  handle: HTMLSpanElement | null;
  add: HTMLButtonElement | null;
  hint: HTMLSpanElement | null;
  icons: (HTMLButtonElement | null)[];
  iconDots: (HTMLSpanElement | null)[];
  sets: (HTMLDivElement | null)[];
}

const SPRING_P = { k: 420, zeta: 0.8 };
const SPRING_T = { k: 360, zeta: 0.92 };
/** Long press on the pill that opens the composer. */
const HOLD_MS = 480;
/** The blurs come back with a short fade, not a pop. */
const FADE_MS = 320;

/** Write a style only when it changed (no style churn on still parts). */
const written = new WeakMap<Element, Record<string, string>>();
function put(el: Element | null, key: string, value: string) {
  if (!el) return;
  let c = written.get(el);
  if (!c) {
    c = {};
    written.set(el, c);
  }
  if (c[key] === value) return;
  c[key] = value;
  const style = (el as HTMLElement).style;
  if (key.startsWith("--")) style.setProperty(key, value);
  else (style as unknown as Record<string, string>)[key] = value;
}

const vis = (visible: boolean) => (visible ? "visible" : "hidden");

/** Momentum for the lists: the finger's speed, decaying. v in px/ms, + = down the list. */
function fling(S: State, el: HTMLElement, v: number, onFrame: () => void) {
  if (pkReduced()) return;
  let vel = v * 16;
  const step = () => {
    vel *= 0.95;
    // read at the start of the frame, before paint writes anything
    const max = el.scrollHeight - el.clientHeight;
    const next = nvaClamp(el.scrollTop + vel, 0, max);
    el.scrollTop = next;
    onFrame();
    if (Math.abs(vel) < 0.3 || next <= 0 || next >= max) {
      S.fling = 0;
      return;
    }
    S.fling = requestAnimationFrame(step);
  };
  S.fling = requestAnimationFrame(step);
}

export function Menu(props: MenuProps) {
  const { side, screen, tiles, counts, me, away, morph } = props;
  const top = tiles.slice(0, 3);
  const rows = menuRows(top);
  const [mode, setMode] = useState<NvaMode>("pill");
  const [hint, setHint] = useState<"more" | "tuck" | null>(null);
  const [holding, setHolding] = useState(false);

  const R = useRef<Refs>({
    root: null,
    scrim: null,
    glass: null,
    shape: null,
    ground: null,
    content: null,
    grab: null,
    head: null,
    tiles: null,
    rowsBox: null,
    list: null,
    rows: null,
    fog: null,
    pillbits: null,
    dots: null,
    handle: null,
    add: null,
    hint: null,
    icons: [],
    iconDots: [],
    sets: [],
  }).current;
  const S = useRef<State>({
    p: { x: 0, v: 0 },
    t: { x: 0, v: 0 },
    tp: 0,
    tt: 0,
    raf: 0,
    last: 0,
    g: null,
    moving: false,
    dragging: false,
    rowsH: 0,
    st: 0,
    gw: 1,
    gh: 1,
    glassHid: false,
    gestureEnd: Number.NEGATIVE_INFINITY,
    fadeT: 0,
    hold: 0,
    hereIdx: -1,
    pillAlpha: 0.8,
    hintShown: null,
    fling: 0,
    focusDots: false,
  }).current;
  const G = useRef<Gesture | null>(null);
  const modeRef = useRef<NvaMode>(mode);
  modeRef.current = mode;
  const cardId = useId();
  const propsRef = useRef(props);
  propsRef.current = props;
  S.hereIdx = screen ? top.indexOf(screen) : -1;

  /* Writes that come from a pointer stream share one frame (frameWriter). */
  const fw = useRef<ReturnType<typeof frameWriter> | null>(null);
  if (!fw.current) fw.current = frameWriter();

  /** The lists' metrics, cached for paint (which must not read layout). */
  const measureLists = useCallback(() => {
    if (R.rows) S.rowsH = R.rows.offsetHeight;
    if (R.list) S.st = R.list.scrollTop;
  }, [R, S]);

  /** The pill's glass is the size of the stop it rests at, set once per stop. */
  const sizeGlass = useCallback(
    (hid: boolean, force?: boolean) => {
      const g = S.g;
      if (!g || (S.glassHid === hid && !force)) return;
      S.glassHid = hid;
      S.gw = hid ? g.HW : g.PW;
      S.gh = hid ? g.HH : g.PH;
      if (R.glass) {
        const gs = R.glass.style;
        gs.width = `${S.gw}px`;
        gs.height = `${S.gh}px`;
        gs.borderRadius = `${S.gh / 2}px`;
      }
    },
    [R, S]
  );

  /* ── paint: write every moving value straight to the DOM (transform,
     opacity, the clip), nothing that lays out, nothing read back ── */
  const paint = useCallback(() => {
    const g = S.g;
    if (!g || !R.shape) return;
    const f = nvaFrame(g, S.p.x, S.t.x, { w: S.gw, h: S.gh }, 3);
    const p = S.p.x;

    put(R.shape, "clipPath", f.clip);
    put(R.shape, "webkitClipPath", f.clip);

    // the shadow: pre-drawn pieces, moved and stretched
    const placed = nvaShadowPlacement(f.shape);
    placed.forEach((set, si) => {
      const el = R.sets[si];
      if (!el) return;
      put(el, "visibility", vis(!set.hidden));
      if (set.hidden) return;
      set.pieces.forEach((pc, n) => {
        const piece = el.children[n] as HTMLElement | undefined;
        if (!piece) return;
        put(piece, "opacity", pc.opacity);
        put(piece, "transform", pc.transform);
        if (n >= 4) put(piece, "visibility", vis(!pc.hidden));
      });
    });

    // see-through pill -> solid card
    put(
      R.ground,
      "opacity",
      (S.pillAlpha + (1 - S.pillAlpha) * f.open).toFixed(3)
    );

    // the three: pill slot -> tile
    f.icons.forEach((ic, i) => {
      const el = R.icons[i];
      if (!el) return;
      put(el, "transform", nvaTransform(ic.x, ic.y, ic.scale));
      put(el, "opacity", ic.opacity.toFixed(3));
      put(el, "visibility", vis(ic.opacity >= NVA_HIDE_BELOW));
      // its "you are here" dot leaves as the card opens
      put(
        R.iconDots[i],
        "opacity",
        (S.hereIdx === i ? nvaUnit(1 - f.open * 5) : 0).toFixed(3)
      );
    });

    // the pill's own end: the hairline and the dot grid
    put(R.pillbits, "transform", nvaTransform(f.pillbits.x, f.pillbits.y));
    put(R.pillbits, "opacity", f.pillbits.opacity.toFixed(3));
    put(R.pillbits, "visibility", vis(f.pillbits.opacity >= NVA_HIDE_BELOW));
    put(R.dots, "opacity", f.dotsOpacity.toFixed(3));

    // the frosted pill: sized to its stop, stretched to the shape in between
    put(
      R.glass,
      "transform",
      `translate(${f.glass.x.toFixed(2)}px,${f.glass.y.toFixed(2)}px) scale(${f.glass.sx.toFixed(4)},${f.glass.sy.toFixed(4)})`
    );
    put(R.glass, "opacity", f.glass.opacity.toFixed(3));
    put(R.glass, "visibility", vis(f.glass.opacity >= NVA_HIDE_BELOW));

    // the create button leaves as the card opens or the pill tucks away
    put(R.add, "transform", nvaTransform(f.add.x, f.add.y, f.add.scale));
    put(R.add, "opacity", f.add.opacity.toFixed(3));
    put(R.add, "visibility", vis(f.add.opacity >= NVA_HIDE_BELOW));

    // tucked away: a handle that brings it back
    put(R.handle, "transform", nvaTransform(f.handle.x, f.handle.y));
    put(R.handle, "opacity", f.handle.opacity.toFixed(3));

    // card content rides the shape's top; tiles and rows arrive in a stagger
    put(R.content, "transform", `translateY(${f.contentY.toFixed(2)}px)`);
    put(R.tiles, "opacity", f.tiles.opacity.toFixed(3));
    put(
      R.tiles,
      "transform",
      `translateY(${f.tiles.y.toFixed(2)}px) scale(${f.tiles.scale.toFixed(3)})`
    );
    put(R.grab, "opacity", f.grabOpacity.toFixed(3));
    const rowEls = R.rows ? R.rows.children : [];
    for (let i = 0; i < rowEls.length; i++) {
      const k = nvaRowK(f.open, i);
      put(rowEls[i], "opacity", k.toFixed(3));
      put(rowEls[i], "transform", `translateY(${((1 - k) * 22).toFixed(2)}px)`);
    }

    // The list shows as much as the card is tall, between the card and full.
    // Its box is fixed per stop (CSS, data-moving / data-at-full) and the clip
    // hides the rest; as the card grows the list keeps its last row at the
    // card's bottom (S.st is the cached scroll).
    if (S.moving && R.list) {
      const maxSt = Math.max(0, S.rowsH - f.visH);
      if (S.st > maxSt + 0.5) {
        S.st = maxSt;
        R.list.scrollTop = maxSt;
      }
    }
    // the soft edge under the tiles shows once the list is scrolled under them
    if (R.head) {
      const hk = nvaHeadK(S.st, f.tiles.opacity);
      put(R.head, "--nva-head-k", hk.toFixed(3));
      put(R.head, "visibility", vis(hk >= 0.01));
    }
    put(R.rowsBox, "visibility", vis(f.rowsVisible));

    // fog sits on the shape's bottom edge, and only while there is more
    if (R.fog) {
      const more = S.rowsH - S.st - f.visH;
      const fogK = nvaFogK(f.open, more);
      put(
        R.fog,
        "transform",
        `translateY(${(f.shape.y + f.shape.h - 132).toFixed(2)}px)`
      );
      put(R.fog, "opacity", fogK.toFixed(3));
      // its dots drift (CSS) only while it shows and the tab is visible
      const live = fogK > 0.01 && !document.hidden ? "1" : "0";
      if (R.fog.getAttribute("data-live") !== live)
        R.fog.setAttribute("data-live", live);
    }

    // the ground dims as the card opens
    put(R.scrim, "opacity", f.scrimOpacity.toFixed(3));

    // the tuck hint floats above the shape while you pull below the pill
    if (R.hint) {
      put(R.hint, "transform", `translate(-50%,${f.hintY.toFixed(2)}px)`);
      put(
        R.hint,
        "opacity",
        (S.dragging && p < -0.04 ? nvaUnit(nvaUnit(-p) * 4) : 0).toFixed(3)
      );
    }
  }, [R, S]);

  /* Motion starts / settles: the layout switches made once per stop (never per
     frame): the list box, will-change, the blurs (nav-a.css, motion.css P2). */
  const moving = useCallback(() => {
    const el = R.root;
    if (!el || S.moving) return;
    S.moving = true;
    window.clearTimeout(S.fadeT);
    el.removeAttribute("data-fade");
    el.setAttribute("data-moving", "");
    propsRef.current.onMoving?.(true);
  }, [R, S]);
  /* Focus back on the "Every place" button that opened the card. It waits for
     rest (the dot grid is invisible while the pill is still growing) and gives
     way to whoever has focus by now: the composer, a layer over the menu, or
     an element outside the menu. */
  const returnFocus = useCallback(() => {
    if (!S.focusDots || modeRef.current !== "pill") return;
    S.focusDots = false;
    if (propsRef.current.away || useNeedt3Ui.getState().composerOpen) return;
    const at = document.activeElement;
    if (at && at !== document.body && !R.root?.contains(at)) return;
    R.dots?.focus({ preventScroll: true });
  }, [R, S]);
  const rest = useCallback(() => {
    const el = R.root;
    if (!el) return;
    const was = S.moving;
    S.moving = false;
    el.removeAttribute("data-moving");
    // full: the list box is the full height; anywhere else the card's
    if (S.p.x >= 0.999 && S.t.x >= 0.999) el.setAttribute("data-at-full", "");
    else el.removeAttribute("data-at-full");
    if (was) {
      el.setAttribute("data-fade", "");
      window.clearTimeout(S.fadeT);
      S.fadeT = window.setTimeout(
        () => el.removeAttribute("data-fade"),
        FADE_MS
      );
      propsRef.current.onMoving?.(false);
    }
    returnFocus();
  }, [R, S, returnFocus]);

  /* ── the spring loop: runs only while something is moving ── */
  const run = useCallback(() => {
    if (S.raf) return;
    moving();
    S.last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.034, (now - S.last) / 1000);
      S.last = now;
      const a = springStep(S.p, S.tp, dt, SPRING_P.k, SPRING_P.zeta);
      const b = springStep(S.t, S.tt, dt, SPRING_T.k, SPRING_T.zeta);
      paint();
      if (a && b) {
        S.p.x = S.tp;
        S.p.v = 0;
        S.t.x = S.tt;
        S.t.v = 0;
        S.raf = 0;
        paint();
        rest();
        return;
      }
      S.raf = requestAnimationFrame(tick);
    };
    S.raf = requestAnimationFrame(tick);
  }, [S, moving, paint, rest]);

  /** Settle at a stop at once: no spring (reduced motion, or the composer opening). */
  const jump = useCallback(
    (m: NvaMode) => {
      cancelAnimationFrame(S.raf);
      S.raf = 0;
      const tg = nvaTargets(m);
      S.tp = tg.p;
      S.tt = tg.t;
      S.p.x = tg.p;
      S.p.v = 0;
      S.t.x = tg.t;
      S.t.v = 0;
      sizeGlass(m === "hidden");
      setMode(m);
      modeRef.current = m;
      paint();
      rest();
    },
    [S, paint, rest, sizeGlass]
  );

  /** Go to a stop; vp / vt = the finger's velocity in p- / t-units per second. */
  const go = useCallback(
    (m: NvaMode, vp?: number, vt?: number) => {
      if (pkReduced()) {
        jump(m);
      } else {
        const tg = nvaTargets(m);
        S.tp = tg.p;
        S.tt = tg.t;
        sizeGlass(m === "hidden");
        if (vp != null) S.p.v = vp;
        if (vt != null) S.t.v = vt;
        setMode(m);
        modeRef.current = m;
        run();
      }
      if (m === "pill" || m === "hidden") {
        // back at the top next time it opens
        window.setTimeout(() => {
          if (
            (modeRef.current === "pill" || modeRef.current === "hidden") &&
            R.list
          ) {
            R.list.scrollTop = 0;
            S.st = 0;
          }
        }, 420);
      }
    },
    [R, S, jump, run, sizeGlass]
  );

  /* Size: the frame's screen box. One ResizeObserver, on the menu and its list. */
  useLayoutEffect(() => {
    const el = R.root;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const g = nvaGeom(el.clientWidth || r.width, el.clientHeight || r.height);
      S.g = g;
      el.style.setProperty("--nva-w", `${g.W}px`);
      el.style.setProperty("--nva-full", `${g.fullH}px`);
      el.style.setProperty("--nva-card", `${g.cardH}px`);
      el.style.setProperty("--nva-tile", `${g.tileW}px`);
      sizeGlass(S.glassHid, true);
      measureLists();
      paint();
      // SSR drew everything unplaced; it shows once it has a place.
      el.setAttribute("data-nva-ready", "");
    };
    measure();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === "function") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
      if (R.rows) ro.observe(R.rows);
    }
    const onVisible = () => paint();
    document.addEventListener("visibilitychange", onVisible); // the fog's drift pauses with the tab
    return () => {
      ro?.disconnect();
      window.clearTimeout(S.fadeT);
      window.clearTimeout(S.hold);
      document.removeEventListener("visibilitychange", onVisible);
      cancelAnimationFrame(S.raf);
      cancelAnimationFrame(S.fling);
      S.raf = 0;
      S.fling = 0;
      fw.current?.cancel();
      G.current?.off?.();
      G.current = null;
    };
  }, [R, S, measureLists, paint, sizeGlass]);
  useLayoutEffect(() => {
    measureLists();
    paint();
  });

  /* The shadow is the theme's --nva-shadow (read from the ground the menu
     floats on), drawn as box-shadow on the pieces, once per theme. The pill
     ground's alpha is read the same way. */
  useLayoutEffect(() => {
    const el = R.root;
    if (!el) return;
    const list = nvaChainShadow(
      nvaParseShadow(getComputedStyle(el).getPropertyValue("--nva-shadow"))
    );
    el.style.setProperty("--nva-shadow-box", nvaBoxShadow(list));
    const ed = nvaShadowEdges(list);
    (["t", "b", "l", "r"] as const).forEach((k) =>
      el.style.setProperty(`--nva-shadow-${k}`, ed[k])
    );
    if (R.shape) {
      const a = parseFloat(
        getComputedStyle(R.shape).getPropertyValue("--nva-pill-alpha")
      );
      S.pillAlpha = Number.isFinite(a) ? a : 0.8;
      paint();
    }
  }, [R, S, side, paint]);

  /* A full-screen layer of the app took the screen: the menu steps down to the
     pill and slides away under the bottom edge (CSS, .is-away). */
  useEffect(() => {
    if (away && modeRef.current !== "pill" && modeRef.current !== "hidden")
      go("pill");
  }, [away, go]);

  /* The composer opens from the pill, wherever the menu was: settle at the pill
     at once (before anything measures it), straight from the store. */
  useEffect(
    () =>
      useNeedt3Ui.subscribe((s, prev) => {
        if (s.composerOpen && !prev.composerOpen && modeRef.current !== "pill")
          jump("pill");
      }),
    [jump]
  );

  /* Escape closes, one level at a time. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const m = modeRef.current;
      if (m === "full") go("card");
      else if (m === "card") go("pill");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  /* Focus follows the stop: into the first tile when the card opens, back to
     the "Every place" button when it closes to the pill (`returnFocus`, at
     rest, or at once when the move was a jump). */
  const prevMode = useRef<NvaMode>(mode);
  useEffect(() => {
    const prev = prevMode.current;
    prevMode.current = mode;
    const move = menuFocusMove(prev, mode);
    S.focusDots = move === "dots";
    if (move === "tile")
      R.tiles?.querySelector<HTMLElement>("button")?.focus({
        preventScroll: true,
      });
    else if (move === "dots" && !S.moving) returnFocus();
  }, [R, S, mode, returnFocus]);

  /* While the card is up the screen behind it is not reachable by keyboard,
     pointer or screen reader (it is the host `ShellFrame` marks). */
  const isOpen = menuIsOpen(mode);
  const sky = usePkSkyMood();
  useEffect(() => {
    const host =
      R.root?.closest("[data-v2p-frame]")?.querySelector("[data-v2p-host]") ??
      null;
    setInert(host, isOpen);
    return () => setInert(host, false);
  }, [R, isOpen]);

  /* ── gestures ── */
  const endHold = () => {
    window.clearTimeout(S.hold);
    S.hold = 0;
    setHolding(false);
  };
  const compose = () => useNeedt3Ui.getState().setComposerOpen(true);

  const onPointerMove = (e: PointerEvent) => {
    const d = G.current;
    const g = S.g;
    if (!d || !g || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    const now = performance.now();
    d.samples.push([now, e.clientY]);
    while (d.samples.length > 2 && now - d.samples[0][0] > 90)
      d.samples.shift();
    if (!d.kind) {
      if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
      endHold();
      if (Math.abs(dx) > Math.abs(dy)) {
        d.kind = "none";
        return;
      }
      const sc = d.scroller;
      d.kind = nvaDragKind({
        canScroll: !!sc && sc.scrollHeight > sc.clientHeight + 1,
        dy,
        scrollTop: sc ? sc.scrollTop : 0,
        t: S.t.x,
      });
      d.yk = d.y0;
      d.px0 = nvaSpringsToTrack(g, S.p.x, S.t.x); // count from the touch-down
      S.dragging = true;
      if (d.kind === "drag") moving();
    }
    if (d.kind === "scroll") {
      const sc = d.scroller as HTMLElement;
      const want = d.s0 - dy;
      if (want < 0 && dy > 0) {
        // scrolled back to the top: the rest of the pull moves the card
        sc.scrollTop = 0;
        S.st = 0;
        d.kind = "drag";
        d.yk = e.clientY;
        d.px0 = nvaSpringsToTrack(g, S.p.x, S.t.x);
        moving();
      } else {
        sc.scrollTop = want;
        S.st = want;
        fw.current?.schedule(paint);
        return;
      }
    }
    if (d.kind !== "drag") return;
    const fy = e.clientY - d.yk; // + down
    const sp = nvaDragSprings(g, d.m, d.px0, fy);
    S.p.x = sp.p;
    S.t.x = sp.t;
    S.t.v = 0;
    S.p.v = 0;
    const h = nvaHint(S.p.x);
    if (h !== S.hintShown) {
      S.hintShown = h;
      setHint(h);
    }
    // one write per frame, however many pointermoves came
    fw.current?.schedule(paint);
  };

  const onPointerUp = (e: PointerEvent | null, reason: EndReason = "up") => {
    const d = G.current;
    const g = S.g;
    if (!d || !g || (e && d.id !== e.pointerId)) return;
    G.current = null;
    fw.current?.cancel();
    endHold();
    S.dragging = false;
    if (d.kind) S.gestureEnd = performance.now();
    S.hintShown = null;
    setHint(null);
    // a cancelled gesture (a hold took the finger, or the browser cancelled
    // it) settles where it was heading and never releases with a velocity
    if (
      reason === "cancel" ||
      !d.kind ||
      d.kind === "none" ||
      d.kind === "held"
    ) {
      if (S.p.x !== S.tp || S.t.x !== S.tt) run();
      else rest();
      return;
    }
    const sm = d.samples;
    const a = sm[0];
    const b = sm[sm.length - 1];
    const vy = b[0] - a[0] > 0 ? (b[1] - a[1]) / (b[0] - a[0]) : 0; // px/ms, + down
    if (d.kind === "scroll") {
      if (d.scroller)
        fling(S, d.scroller, -vy, () => {
          S.st = R.list ? R.list.scrollTop : 0;
          paint();
        });
      return;
    }
    const rel = nvaRelease(g, { from: d.m, p: S.p.x, t: S.t.x, vy });
    go(rel.mode, rel.vp, rel.vt);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button > 0) return;
    const g = S.g;
    if (!g) return;
    const m = modeRef.current;
    const target = e.target as Element;
    const scroller = target.closest?.(
      "[data-nva-scroll]"
    ) as HTMLElement | null;
    cancelAnimationFrame(S.raf);
    S.raf = 0; // catch it mid-flight
    cancelAnimationFrame(S.fling);
    S.fling = 0;
    G.current?.off?.();
    // Follow the finger on the window: it may leave the shape (and the
    // phone) mid-drag, and pointer capture is not reliable across inputs.
    const off = pkTrack(onPointerMove, onPointerUp, e.pointerId);
    G.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      m,
      scroller,
      s0: scroller ? scroller.scrollTop : 0,
      kind: null,
      samples: [[performance.now(), e.clientY]],
      yk: e.clientY,
      px0: 0,
      off,
    };
    if (m === "pill") {
      setHolding(true);
      S.hold = window.setTimeout(() => {
        S.hold = 0;
        setHolding(false);
        const d = G.current;
        if (d && !d.kind) {
          d.kind = "held";
          S.gestureEnd = performance.now();
          compose();
        }
      }, HOLD_MS);
    }
  };

  /* A drag or a hold is not a tap: clicks right after one are swallowed. */
  const onClickCapture = (e: React.MouseEvent) => {
    if (performance.now() - S.gestureEnd < 400) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const pick = (id: MenuPlaceId) => {
    if (id === "settings") propsRef.current.onSettings();
    else propsRef.current.onPick(id);
    if (modeRef.current !== "pill") go("pill");
  };
  const onShapeClick = (e: React.MouseEvent) => {
    // the pill's ground (not one of the three) opens; the handle comes back
    if ((e.target as Element).closest("button")) return;
    if (modeRef.current === "pill") go("card");
    else if (modeRef.current === "hidden") go("pill");
  };

  const inverse = side === "dark" ? "paper" : "dark";
  const open = isOpen;
  const here = screen ? top.includes(screen) : false;
  /* scroll positions are cached here (paint never reads layout) */
  const onScroll = () => {
    if (R.list) S.st = R.list.scrollTop;
    paint();
  };

  return (
    <div
      ref={(n) => {
        R.root = n;
      }}
      className={
        "nva " +
        (side === "dark" ? "is-dark" : "is-light") +
        (away ? " is-away" : "") +
        (morph ? " is-morph" : "")
      }
      data-nva-mode={mode}
      data-nav-variant="A"
      inert={away || undefined}
    >
      <div
        ref={(n) => {
          R.scrim = n;
        }}
        className="nva-scrim"
        style={{ pointerEvents: open ? "auto" : "none" }}
        onClick={() => go("pill")}
        aria-hidden="true"
      />

      {/* The pill's glass (a backdrop blur cut to the pill) is the one blur
          while the menu moves. Its box IS the closed pill: the composer
          morphs out of `[data-nva-pill]` (its rect and computed radius). */}
      <div
        ref={(n) => {
          R.glass = n;
        }}
        className="nva-glass"
        data-nva-pill=""
        aria-hidden="true"
      />
      <div className={"nva-body" + (holding ? " is-holding" : "")}>
        {/* The shadow: pre-drawn pieces that move with the shape. */}
        <div className="nva-shadow" aria-hidden="true">
          {NVA_SH_R.map((r0, si) => (
            <div
              key={r0}
              ref={(n) => {
                R.sets[si] = n;
              }}
              className="nva-sh-set"
            >
              {nvaShadowPieces(r0).map((pc, i) => (
                <span
                  key={i}
                  className={"nva-sh" + (pc.edge ? ` is-${pc.edge}` : "")}
                  style={{ width: pc.w, height: pc.h }}
                >
                  {pc.edge ? null : (
                    <i
                      style={{
                        left: pc.ix,
                        top: pc.iy,
                        width: pc.big,
                        height: pc.big,
                        borderRadius: r0,
                      }}
                    />
                  )}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div
          ref={(n) => {
            R.shape = n;
          }}
          className={"nva-shape " + inverse}
          role="navigation"
          aria-label="Menu"
          onPointerDown={onPointerDown}
          onClickCapture={onClickCapture}
          onClick={onShapeClick}
        >
          <div
            ref={(n) => {
              R.ground = n;
            }}
            className="nva-ground"
          />

          {/* Card content, positioned from the shape's top edge. */}
          <div
            ref={(n) => {
              R.content = n;
            }}
            className="nva-content"
            id={cardId}
            aria-hidden={open ? undefined : "true"}
          >
            <span
              ref={(n) => {
                R.grab = n;
              }}
              className="nva-grab"
            />
            {/* The soft edge the list scrolls under, below the pinned tiles. */}
            <div
              ref={(n) => {
                R.head = n;
              }}
              className="nva-head"
              aria-hidden="true"
            >
              <span className="nva-head-blur is-1" />
              <span className="nva-head-blur is-2" />
              <span className="nva-head-blur is-3" />
              <span className="nva-head-wash" />
            </div>
            <div
              ref={(n) => {
                R.tiles = n;
              }}
              className="nva-tiles"
              data-px-scope=""
              data-px-night={sky.dark ? "1" : undefined}
            >
              <div className="nva-sky" aria-hidden="true" data-nva-sky="">
                <PxSky
                  horizon="none"
                  fps={15}
                  radius={32}
                  mood={sky.mood ?? undefined}
                  dark={sky.dark}
                  parked={!isOpen}
                />
              </div>
              {top.map((id) => {
                const bd = menuBadge(id, counts);
                return (
                  <button
                    key={id}
                    type="button"
                    tabIndex={open ? 0 : -1}
                    className={"nva-tile" + (screen === id ? " is-on" : "")}
                    onClick={() => pick(id)}
                    aria-label={menuWord(id)}
                    data-nva-tile={id}
                  >
                    <span className="nva-tile-label">{menuWord(id)}</span>
                    {bd ? (
                      <span
                        className={
                          "nva-tile-badge" + (bd.alert ? " is-alert" : "")
                        }
                      >
                        {bd.text}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div
              ref={(n) => {
                R.rowsBox = n;
              }}
              className="nva-rows-box"
            >
              <div
                className="nva-scroll nva-rows-scroll"
                ref={(n) => {
                  R.list = n;
                }}
                onScroll={onScroll}
                data-nva-scroll="rows"
              >
                <div
                  ref={(n) => {
                    R.rows = n;
                  }}
                  className="nva-rows"
                >
                  {rows.map((id) => {
                    const st = menuStatus(id, counts);
                    return (
                      <button
                        key={id}
                        type="button"
                        tabIndex={open ? 0 : -1}
                        className={"nva-row" + (screen === id ? " is-on" : "")}
                        onClick={() => pick(id)}
                        data-nva-row={id}
                      >
                        <span className="nva-row-icon">
                          <MenuGlyph id={id} />
                        </span>
                        <span className="nva-row-text">
                          <span className="nva-row-word">{menuWord(id)}</span>
                          <span
                            className={
                              "nva-row-cap" + (st.alert ? " is-alert" : "")
                            }
                          >
                            {st.alert ? (
                              <span className="nva-alert-dot" />
                            ) : null}
                            {st.text}
                          </span>
                        </span>
                        {screen === id ? (
                          <span
                            className="nva-here"
                            aria-label="You are here"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    tabIndex={open ? 0 : -1}
                    className="nva-row nva-row-me"
                    onClick={() => propsRef.current.onSettings()}
                    data-nva-row="profile"
                  >
                    <span className="nva-avatar" aria-hidden="true">
                      {me.initial}
                    </span>
                    <span className="nva-row-text">
                      <span className="nva-me-row-name">{me.name}</span>
                      <span className="nva-row-cap">
                        Account, plan and sign out
                      </span>
                    </span>
                    <span className={"nva-plan" + (me.pro ? " is-pro" : "")}>
                      {me.plan}
                    </span>
                  </button>
                </div>
                {/* keeps the card's scroll range while the box is full height (moving) */}
                <div className="nva-rows-pad" aria-hidden="true" />
              </div>
            </div>
          </div>

          {/* The fog: rows past the fourth melt into the card. */}
          <div
            ref={(n) => {
              R.fog = n;
            }}
            className="nva-fog"
            aria-hidden="true"
            data-live="0"
          >
            <span className="nva-fog-blur is-1" />
            <span className="nva-fog-blur is-2" />
            <span className="nva-fog-blur is-3" />
            <span className="nva-fog-wash" />
            <span className="nva-fog-dots is-1" />
            <span className="nva-fog-dots is-2" />
            <span className="nva-fog-dots is-3" />
          </div>

          {/* The three, travelling between the pill and the tile row. */}
          {top.map((id, i) => (
            <button
              key={id}
              ref={(n) => {
                R.icons[i] = n;
              }}
              type="button"
              className={"nva-icon" + (screen === id ? " is-on" : "")}
              tabIndex={mode === "pill" ? 0 : -1}
              aria-label={menuWord(id)}
              aria-current={screen === id ? "page" : undefined}
              onClick={() => pick(id)}
              data-nva-icon={id}
            >
              <MenuGlyph id={id} />
              <span
                className="nva-icon-dot"
                ref={(n) => {
                  R.iconDots[i] = n;
                }}
              />
            </button>
          ))}

          {/* The pill's own end: a hairline and the dot grid that opens the rest. */}
          <div
            ref={(n) => {
              R.pillbits = n;
            }}
            className="nva-pillbits"
          >
            <span className="nva-hair" />
            <button
              ref={(n) => {
                R.dots = n;
              }}
              type="button"
              className={"nva-dots" + (!here ? " is-here" : "")}
              tabIndex={mode === "pill" ? 0 : -1}
              onClick={() => go("card")}
              aria-expanded={open}
              aria-controls={cardId}
              aria-label={
                "Every place" +
                (!here && screen ? ` — you are in ${menuWord(screen)}` : "")
              }
              data-nva-open
            >
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span key={i} className="nva-dot" />
              ))}
            </button>
          </div>

          {/* Tucked away: a handle that brings it back. */}
          <span
            ref={(n) => {
              R.handle = n;
            }}
            className="nva-handle"
            aria-hidden="true"
          />
          {mode === "hidden" ? (
            <button
              type="button"
              className="nva-handle-hit"
              onClick={() => go("pill")}
              aria-label="Show the menu"
              data-nva-handle
            />
          ) : null}
        </div>
      </div>

      {/* New task: the same as holding the pill. */}
      <button
        ref={(n) => {
          R.add = n;
        }}
        type="button"
        className={"nva-add " + inverse}
        tabIndex={mode === "pill" ? 0 : -1}
        aria-label="New task"
        data-nva-add=""
        onClick={() => {
          if (modeRef.current === "pill") compose();
        }}
      >
        <LuPlus size={22} />
      </button>
      <span
        ref={(n) => {
          R.hint = n;
        }}
        className={"nva-hint " + inverse}
        aria-live="polite"
      >
        {hint === "tuck"
          ? "Let go to tuck it away"
          : "Pull further to tuck it away"}
      </span>
    </div>
  );
}
