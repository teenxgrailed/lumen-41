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
import { pkAdoptDocumentScroll } from "./scroll";
import { pkClamp, pkCx } from "./util";

export { PkScrim } from "./Scrim";

/* ══ Blur band (additions-2/phone-shell, ps-) ═════════════════════════════
   The fog under the dock is progressive blur in two masked steps (4 / 14 px)
   plus a wash. Nothing is fixed at the top of the phone (owner decision
   2026-10-25): content scrolls under the status bar and Safari's bar.
   The band must not sit under an ancestor with opacity / filter / mask, or
   the blur sees nothing — the fade (--pk-fog-k) goes on each layer itself
   (phone-shell.css). The layers wear `pk-blur` so the rest-while-moving and
   rest-while-hidden rules (phone-perf.css, motion.css) still reach them. */
export function PkBlurLayers() {
  return (
    <>
      <span className="pk-blur b b1" />
      <span className="pk-blur b b2" />
    </>
  );
}

/* ══ Fog that drifts like the sky ═════════════════════════════════════════
   The halftone dots in the bottom band drift slowly right → left and bob a
   hair, all the time the band is seen (the owner's exception to "nothing
   loops at rest", MOTION.md). Compositor-only (`translate` / `transform` CSS
   animations), and only while the band is live: on screen, the tab visible.
   Reduced motion = still dots. */
export function pkFogLive(
  el: Element | null,
  /**
   * Watch whether the band is on screen. Off for the phone's fog: its host is
   * a fixed, zero-height element parked above the bottom edge
   * (phone-ground.css), and an IntersectionObserver can report a box with no
   * area as not seen, which parks the dots for good. A fixed band is on screen
   * whenever the tab is visible.
   */
  observe = true
) {
  if (!el || typeof document === "undefined") return undefined;
  let seen = true;
  const sync = () => {
    const v = seen && !document.hidden ? "1" : "0";
    if (el.getAttribute("data-pk-live") !== v)
      el.setAttribute("data-pk-live", v);
  };
  const io =
    observe && typeof IntersectionObserver === "function"
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
  useEffect(() => pkFogLive(own.current, false), []);
  return (
    <div
      ref={setEl}
      className="pk-fog ps-bot"
      aria-hidden="true"
      data-pk-live="0"
    >
      <PkBlurLayers />
      <span className="pk-fog-wash t" />
      <span className="pk-fog-dots is-1" />
      <span className="pk-fog-dots is-2" />
      <span className="pk-fog-dots is-3" />
    </div>
  );
}

/* ══ The screen scaffold ══════════════════════════════════════════════════ */

export interface PkScreenProps {
  /** The large title. It sits in the page flow and scrolls away with the content. */
  title?: ReactNode;
  /** A line under the title. */
  sub?: ReactNode;
  /** A node at the right of the title row (a segmented control, a round button). */
  right?: ReactNode;
  /** More header content under `sub` (Home's big figures). */
  head?: ReactNode;
  headClass?: string;
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
 * fixed at the top) from under a 52 px status bar, a large title in the page
 * flow, and a bottom fog behind the menu pill. Scroll only changes a custom
 * property on the root (no layout), and only when the clamped value changes.
 */
export function PkScreen({
  title,
  sub,
  right,
  head,
  headClass,
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

  // On scroll only: the bottom fog shows while there is content under it.
  useLayoutEffect(() => {
    const el = scroller;
    const r = root.current;
    if (!el || !r) return undefined;
    let last = "";
    const read = () => {
      const left = el.scrollHeight - el.clientHeight - el.scrollTop;
      const fog = pkClamp((left - 40) / 60, 0, 1);
      const key = fog.toFixed(3);
      if (key === last) return;
      last = key;
      r.style.setProperty("--pk-fog-k", key);
      // The fog's drift and its backdrop blur rest while it is faded out.
      r.setAttribute("data-pk-fog-on", fog > 0.01 ? "1" : "0");
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

  const hasGlyph = !!(glyph || glyphKind);
  return (
    <div
      ref={root}
      className={pkCx("pk-screen", className)}
      data-pk-screen={screen ?? ""}
      data-pk-fog-on="0"
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
      <PkFog />
    </div>
  );
}
