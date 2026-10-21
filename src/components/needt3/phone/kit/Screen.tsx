"use client";

import {
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { PkGlyph } from "./Material";
import { PkPullDown, type PkPullProps } from "./PullDown";
import { pkAdoptDocumentScroll, pkPsK } from "./scroll";
import { pkClamp, pkCx } from "./util";

export { PkScrim } from "./Scrim";

/* ══ Blur bands (additions-2/phone-shell, ps-) ═══════════════════════════
   Progressive blur in masked steps: three at the top (3 / 9 / 20 px), two in
   the fog (4 / 14 px), each fading in from the band's inner edge, plus a tint.
   The bands must not sit under an ancestor with opacity / filter / mask, or
   the blur sees nothing — the fade (--ps-k, --pk-fog-k) goes on each layer
   itself (phone-shell.css). The steps wear `pk-blur` so the rest-while-moving
   and rest-while-hidden rules (phone-perf.css, motion.css) still reach them. */
export function PkBlurLayers({ steps = 3 }: { steps?: 2 | 3 }) {
  return (
    <>
      <span className="pk-blur b b1" />
      <span className="pk-blur b b2" />
      {steps === 3 ? <span className="pk-blur b b3" /> : null}
    </>
  );
}

/** The top band alone (PkScreen has one): three masked blur steps and a tint at the status bar. */
export function PkTopBand({ className }: { className?: string }) {
  return (
    <div className={pkCx("pk-topband ps-top", className)} aria-hidden="true">
      <PkBlurLayers steps={3} />
      <span className="pk-topband-wash t" />
    </div>
  );
}

/* ══ Fog that drifts like the sky ═════════════════════════════════════════
   The halftone dots in the bottom band drift slowly right → left and bob a
   hair, all the time the band is seen (the owner's exception to "nothing
   loops at rest", MOTION.md). Compositor-only (`translate` / `transform` CSS
   animations), and only while the band is live: on screen, the tab visible.
   Reduced motion = still dots. */
export function pkFogLive(el: Element | null) {
  if (!el || typeof document === "undefined") return undefined;
  let seen = true;
  const sync = () => {
    const v = seen && !document.hidden ? "1" : "0";
    if (el.getAttribute("data-pk-live") !== v)
      el.setAttribute("data-pk-live", v);
  };
  const io =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver((es) => {
          seen = es[es.length - 1].isIntersecting;
          sync();
        })
      : null;
  io?.observe(el);
  document.addEventListener("visibilitychange", sync);
  sync();
  return () => {
    io?.disconnect();
    document.removeEventListener("visibilitychange", sync);
  };
}

export function PkFog({ fogRef }: { fogRef?: Ref<HTMLDivElement> }) {
  const own = useRef<HTMLDivElement | null>(null);
  const setEl = useCallback(
    (n: HTMLDivElement | null) => {
      own.current = n;
      if (typeof fogRef === "function") fogRef(n);
      else if (fogRef)
        (fogRef as { current: HTMLDivElement | null }).current = n;
    },
    [fogRef]
  );
  useEffect(() => pkFogLive(own.current), []);
  return (
    <div
      ref={setEl}
      className="pk-fog ps-bot"
      aria-hidden="true"
      data-pk-live="0"
    >
      <PkBlurLayers steps={2} />
      <span className="pk-fog-wash t" />
      <span className="pk-fog-dots is-1" />
      <span className="pk-fog-dots is-2" />
      <span className="pk-fog-dots is-3" />
    </div>
  );
}

/* ══ The screen scaffold ══════════════════════════════════════════════════ */

export interface PkScreenProps {
  /** The large title. It collapses into a compact title while the content scrolls under the status bar. */
  title?: ReactNode;
  /** Text for the compact bar (default: the title when it is a string). */
  compactTitle?: string;
  /** A line under the title. */
  sub?: ReactNode;
  /** A node at the right of the title row (a segmented control, a round button). */
  right?: ReactNode;
  /** More header content under `sub` (Home's big figures). */
  head?: ReactNode;
  headClass?: string;
  /** Pull down at the top drops the pull-down plate (search, or add). */
  onPull?: Omit<PkPullProps, "scroller">;
  /** `data-pk-screen` value, for tests and CSS hooks. */
  screen?: string;
  /** Receives the scroll container. */
  scrollRef?: (el: HTMLElement | null) => void;
  /** `false` drops the bottom spacer (default 132 px so the last row clears the pill). */
  tail?: boolean;
  className?: string;
  glyph?: string;
  glyphKind?: string;
  children?: ReactNode;
}

/**
 * The phone screen: content that the document scrolls (momentum, nothing
 * fixed at the edges) under a 52 px status bar, a large title that hands over to a
 * compact one over a progressive top blur, and a bottom fog behind the menu
 * pill. Scroll only changes custom properties on the root (no layout), and
 * only when the clamped values change.
 */
export function PkScreen({
  title,
  compactTitle,
  sub,
  right,
  head,
  headClass,
  onPull,
  screen,
  scrollRef,
  tail,
  className,
  glyph,
  glyphKind,
  children,
}: PkScreenProps) {
  const root = useRef<HTMLDivElement>(null);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const setSc = useCallback(
    (el: HTMLDivElement | null) => {
      setScroller(el);
      scrollRef?.(el);
    },
    [scrollRef]
  );

  // The page scrolls, not this block (see ./scroll.ts): the block answers for
  // the document so everything that asks the "scroller" gets the page.
  useLayoutEffect(
    () => (scroller ? pkAdoptDocumentScroll(scroller) : undefined),
    [scroller]
  );

  // On scroll only: --ps-k = clamp((scrollY - 8) / 44, 0, 1) drives the top
  // band, the small title and the large title's hand-over (phone-shell); the
  // bottom fog shows while there is content under it.
  useLayoutEffect(() => {
    const el = scroller;
    const r = root.current;
    if (!el || !r) return undefined;
    let last = "";
    const read = () => {
      const y = el.scrollTop;
      const k = pkPsK(y);
      const left = el.scrollHeight - el.clientHeight - y;
      const fog = pkClamp((left - 40) / 60, 0, 1);
      const key = k.toFixed(3) + fog.toFixed(3);
      if (key === last) return;
      last = key;
      r.style.setProperty("--ps-k", k.toFixed(3));
      // kept for the docs back button (phone-docs.css), which still reads it
      r.style.setProperty("--pk-kt", k.toFixed(3));
      r.style.setProperty("--pk-fog-k", fog.toFixed(3));
      r.setAttribute("data-pk-collapsed", k > 0.5 ? "1" : "0");
      // The large title is transformed only once it starts to hand over: a
      // transform at rest would make it the containing block of fixed children.
      r.setAttribute("data-ps-on", k > 0.001 ? "1" : "0");
      // The fog's drift and both bands' backdrop blur rest while they are faded out.
      r.setAttribute("data-pk-fog-on", fog > 0.01 ? "1" : "0");
      r.setAttribute("data-pk-band-on", k > 0.01 ? "1" : "0");
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro =
      typeof ResizeObserver === "function" ? new ResizeObserver(read) : null;
    if (ro) {
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    return () => {
      el.removeEventListener("scroll", read);
      ro?.disconnect();
    };
  }, [scroller]);

  const small = compactTitle ?? (typeof title === "string" ? title : "");
  const hasGlyph = !!(glyph || glyphKind);
  return (
    <div
      ref={root}
      className={pkCx("pk-screen", className)}
      data-pk-screen={screen ?? ""}
      data-pk-collapsed="0"
      data-pk-fog-on="0"
      data-pk-band-on="0"
      data-ps-on="0"
    >
      <div ref={setSc} className="pk-scroll">
        <div className="pk-content">
          {title != null || sub || head ? (
            <header className={pkCx("pk-head", headClass)}>
              {title != null && hasGlyph && right ? (
                // a glyph and a control: the tile and the control share a row
                // above the title, so a long title keeps the full width
                <>
                  <div className="pk-head-row is-top">
                    <PkGlyph
                      place={glyph}
                      kind={glyphKind}
                      size="m"
                      className="pk-head-glyph"
                    />
                    {right}
                  </div>
                  <div className="pk-head-row">
                    <h1 className="pk-title">{title}</h1>
                  </div>
                </>
              ) : title != null ? (
                <div className="pk-head-row">
                  {hasGlyph ? (
                    <PkGlyph
                      place={glyph}
                      kind={glyphKind}
                      size="l"
                      className="pk-head-glyph"
                    />
                  ) : null}
                  <h1 className="pk-title">{title}</h1>
                  {right ?? null}
                </div>
              ) : null}
              {sub ? <p className="pk-sub">{sub}</p> : null}
              {head ?? null}
            </header>
          ) : null}
          {children}
          {tail === false ? null : <div className="pk-tail" />}
        </div>
      </div>
      <PkTopBand />
      {small ? (
        <div className="pk-compact ps-title" aria-hidden="true">
          {hasGlyph ? (
            <PkGlyph
              place={glyph}
              kind={glyphKind}
              size={20}
              className="pk-compact-glyph"
            />
          ) : null}
          <span className="pk-compact-title">{small}</span>
        </div>
      ) : null}
      <PkFog />
      {onPull ? <PkPullDown scroller={scroller} {...onPull} /> : null}
    </div>
  );
}
