"use client";

/* Drag and drop — one gesture for the whole product (desktop), $P/Drag.jsx.
 *
 * A drop target is any DOM node with data-drop; nothing registers itself:
 *   data-drop="timeline" + data-date/-start/-hour-h/-offset → a time on a day
 *   data-drop="day"      + data-date (+ data-label)         → a day
 *   data-drop="project"  + data-id (+ data-label)           → a project
 *   data-drop="row"      + data-id                          → a place in a list
 *   data-drop="focus"                                       → a focus session
 * A source whose list holds other sources is sortable inside that list.
 *
 * Press, move 4px, and only then is it a drag. The picked item itself lifts
 * (a clone in a fixed layer; the source stays mounted and hidden as the gap),
 * follows the pointer 1:1, and on drop flies into the block the drop made,
 * settles into its list's gap, or flies back home (missed, Esc).
 *
 * PORT.md §5, enforced here:
 *  1. One rAF per pointer stream. `pointermove` only records the point and
 *     asks for a frame; the frame does the lift, the hit test, the paint and
 *     the edge autoscroll, and publishes to React only when the target
 *     changed (never per pixel).
 *  2. No getBoundingClientRect() in `pointermove`. Rects (a timeline column,
 *     a list, a scroller) are measured once per drag in the frame and cached;
 *     the cache is dropped on scroll and resize, and after an autoscroll step.
 *  3. Nothing is observed per card.
 *  4. The live session lives in a ref, never a stale closure.
 * Reduced motion: no lean, no fly — every move is instant.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  DRAG_THRESHOLD_PX,
  edgeScroll,
  formatDragTime,
  nextLean,
  shiftFor,
  sortIndexAt,
  timelineTimeAt,
} from "./geometry";

export type DragMode = "move" | "place";

export interface DragItem {
  id: string;
  title: string;
}

/** What is under the hand, as the drop reports it. */
export interface DragOver {
  kind: "timeline" | "day" | "project" | "row" | "focus";
  id?: string | null;
  date?: string | null;
  time?: number | null;
  label?: string | null;
  node?: Element | null;
  /** Reorder inside one list: the rows as drawn, and where the item went. */
  order?: (string | null)[];
  fromIx?: number;
  toIx?: number;
}

export type DropHandler = (
  item: DragItem,
  over: DragOver,
  mode: DragMode
) => void;

/** What React sees of a drag: the item and the kind/place under the hand. */
export interface DragState {
  item: DragItem;
  mode: DragMode;
  over: DragOver | null;
}

export type DragProps = (
  item: DragItem,
  mode?: DragMode
) => {
  "data-drag-src": string;
  "data-drag-id": string;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
};

const SETTLE_FALLBACK_MS = 380;
const REDUCED = "(prefers-reduced-motion: reduce)";

const calmNow = () =>
  typeof window !== "undefined" && !!window.matchMedia?.(REDUCED).matches;

interface Armed {
  item: DragItem;
  mode: DragMode;
  x0: number;
  y0: number;
  el: HTMLElement;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface SortRowM {
  el: Element;
  top: number;
  h: number;
  id: string | null;
  at: number;
}

interface Session {
  item: DragItem;
  mode: DragMode;
  node: HTMLElement;
  layer: HTMLDivElement;
  card: HTMLDivElement;
  tag: HTMLSpanElement;
  calm: boolean;
  r0: Box;
  x0: number;
  y0: number;
  x: number;
  y: number;
  lean: number;
  lastX: number;
  sort: {
    list: Element;
    rows: SortRowM[];
    i: number;
    kids: HTMLElement[];
    pitch: number;
  } | null;
  j: number;
  over: DragOver | null;
  overNode: Element | null;
  /** Cached rects, dropped on scroll / resize / autoscroll. */
  rects: Map<Element, Box>;
  /** The scroller around a hit element (or null), per element. */
  scrollers: WeakMap<Element, HTMLElement | null>;
  scope: Element;
}

function box(r: DOMRect): Box {
  return {
    left: r.left,
    top: r.top,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
  };
}

function rectOf(s: Session, el: Element): Box {
  let r = s.rects.get(el);
  if (!r) {
    r = box(el.getBoundingClientRect());
    s.rects.set(el, r);
  }
  return r;
}

/** The nearest scrolling ancestor of `el`, cached per element for the drag. */
function scrollerOf(s: Session, el: Element | null): HTMLElement | null {
  if (!el) return null;
  if (s.scrollers.has(el)) return s.scrollers.get(el) ?? null;
  let cur: Element | null = el;
  let found: HTMLElement | null = null;
  while (cur && cur !== document.body) {
    if (cur instanceof HTMLElement) {
      const oy = window.getComputedStyle(cur).overflowY;
      if (
        (oy === "auto" || oy === "scroll") &&
        cur.scrollHeight > cur.clientHeight + 4
      ) {
        found = cur;
        break;
      }
    }
    cur = cur.parentElement;
  }
  s.scrollers.set(el, found);
  return found;
}

/** The sortable list around a source (vertical lists in normal flow only). */
function dragListOf(el: HTMLElement) {
  let cur: HTMLElement | null = el;
  for (let up = 0; cur && cur.parentElement && up < 6; up++) {
    const parent: HTMLElement = cur.parentElement;
    const self: HTMLElement = cur;
    const kids = Array.from(parent.children).filter(
      (k) =>
        k === self ||
        k.matches("[data-drag-src]") ||
        !!k.querySelector("[data-drag-src]")
    );
    if (kids.length > 1) {
      const pos = window.getComputedStyle(cur).position;
      if (pos === "absolute" || pos === "fixed") return null;
      const a = kids[0].getBoundingClientRect();
      const b = kids[1].getBoundingClientRect();
      if (Math.abs(a.left - b.left) > 4 || b.top <= a.top) return null;
      return { slot: cur, list: parent, rows: kids };
    }
    cur = parent;
  }
  return null;
}

/** The [data-drop] node under a point, resolved with cached geometry. */
function targetAt(s: Session, x: number, y: number) {
  const el = document.elementFromPoint(x, y);
  const node = el?.closest("[data-drop]") ?? null;
  if (!node) return { el, over: null as DragOver | null };
  const kind = node.getAttribute("data-drop") as DragOver["kind"];
  if (kind === "timeline") {
    const r = rectOf(s, node);
    const time = timelineTimeAt(y, {
      rectTop: r.top,
      scrollTop: node instanceof HTMLElement ? node.scrollTop : 0,
      hourH: parseFloat(node.getAttribute("data-hour-h") ?? "") || 46,
      start: parseFloat(node.getAttribute("data-start") ?? "") || 0,
      offset: parseFloat(node.getAttribute("data-offset") ?? "") || 0,
    });
    return {
      el,
      over: {
        kind,
        time,
        label: formatDragTime(time),
        node,
        date: node.getAttribute("data-date"),
      } as DragOver,
    };
  }
  return {
    el,
    over: {
      kind,
      id: node.getAttribute("data-id"),
      date: node.getAttribute("data-date"),
      label: node.getAttribute("data-label"),
      node,
    } as DragOver,
  };
}

const sameOver = (a: DragOver | null, b: DragOver | null) =>
  a === b ||
  !!(
    a &&
    b &&
    a.kind === b.kind &&
    a.date === b.date &&
    a.time === b.time &&
    a.id === b.id &&
    a.node === b.node &&
    a.toIx === b.toIx
  );

/** The line under the lifted card. */
export function dragSays(o: DragOver | null) {
  if (!o) return "";
  if (o.kind === "timeline" || o.kind === "day") return o.label || "";
  if (o.kind === "focus") return "Focus on this";
  if (o.kind === "project") return o.label ? `Move to ${o.label}` : "";
  return "";
}

/**
 * The drag engine. `container` is where the lifted layer is mounted (an
 * element inside `.needt-v3`, so the scoped styles reach it).
 */
export function useDrag(onDrop: DropHandler, container: HTMLElement | null) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const armed = useRef<Armed | null>(null);
  const S = useRef<Session | null>(null);
  const raf = useRef(0);
  const point = useRef({ x: 0, y: 0, fresh: false });
  const dropRef = useRef(onDrop);
  const containerRef = useRef(container);
  const swallowUntil = useRef(0);
  dropRef.current = onDrop;
  containerRef.current = container;

  useEffect(() => {
    /* ── lift: the source node itself goes up (runs inside the frame) ── */
    function lift(a: Armed, x: number, y: number): Session | null {
      const el = a.el;
      if (!el.isConnected) return null;
      const sort = a.mode === "place" ? dragListOf(el) : null;
      const node = (sort ? sort.slot : el) as HTMLElement;
      const r = box(node.getBoundingClientRect());
      const calm = calmNow();
      const host = containerRef.current ?? document.body;
      const scope =
        host.closest(".needt-v3") ??
        node.closest(".needt-v3") ??
        document.documentElement;
      const layer = document.createElement("div");
      layer.className = "shell-drag-lift";
      layer.setAttribute("aria-hidden", "true");
      Object.assign(layer.style, {
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
      const card = document.createElement("div");
      card.className = "shell-drag-lift-card";
      const clone = node.cloneNode(true) as HTMLElement;
      clone.removeAttribute("data-drag-slot");
      [
        clone,
        ...Array.from(
          clone.querySelectorAll("[id],[data-drop],[data-drag-src]")
        ),
      ].forEach((n) => {
        n.removeAttribute("id");
        n.removeAttribute("data-drop");
        n.removeAttribute("data-drag-src");
        n.removeAttribute("data-drag-id");
      });
      const pos = window.getComputedStyle(node).position;
      if (pos === "absolute" || pos === "fixed")
        Object.assign(clone.style, {
          position: "relative",
          left: "0",
          top: "0",
          right: "auto",
          bottom: "auto",
          margin: "0",
          width: `${r.width}px`,
          height: `${r.height}px`,
          opacity: "1",
          transform: "none",
        });
      clone.classList.add("shell-drag-lift-node");
      card.appendChild(clone);
      const tag = document.createElement("span");
      tag.className = "shell-drag-lift-tag";
      layer.appendChild(card);
      layer.appendChild(tag);
      host.appendChild(layer);
      node.setAttribute("data-drag-slot", "");
      scope.classList.add("is-drag-active");
      const s: Session = {
        item: a.item,
        mode: a.mode,
        node,
        layer,
        card,
        tag,
        calm,
        r0: r,
        x0: a.x0,
        y0: a.y0,
        x,
        y,
        lean: 0,
        lastX: x,
        sort: null,
        j: -1,
        over: null,
        overNode: null,
        rects: new Map(),
        scrollers: new WeakMap(),
        scope,
      };
      if (sort) {
        const lr = sort.list.getBoundingClientRect();
        const kids = Array.from(sort.list.children) as HTMLElement[];
        const rows = sort.rows.map((k) => {
          const kr = k.getBoundingClientRect();
          const src = k.matches("[data-drag-src]")
            ? k
            : k.querySelector("[data-drag-src]");
          return {
            el: k,
            top: kr.top - lr.top,
            h: kr.height,
            id: src ? src.getAttribute("data-drag-id") : null,
            at: kids.indexOf(k as HTMLElement),
          };
        });
        const i = rows.findIndex((q) => q.el === node);
        const gap =
          rows.length > 1
            ? Math.max(0, rows[1].top - rows[0].top - rows[0].h)
            : 0;
        s.sort = { list: sort.list, rows, i, kids, pitch: r.height + gap };
        s.rects.set(sort.list, box(lr));
        s.j = i;
      }
      // the lift itself: scale + shadow ease in on the next frame
      window.requestAnimationFrame(() => {
        if (S.current === s) card.classList.add("is-up");
      });
      return s;
    }

    function shiftRows(s: Session, j: number) {
      const q = s.sort;
      if (!q) return;
      const from = q.rows[q.i].at;
      const to = j < 0 ? from : q.rows[j].at;
      q.kids.forEach((k, idx) => {
        const dy = shiftFor(idx, from, to, q.pitch);
        if (dy) {
          k.setAttribute("data-drag-shift", "");
          k.style.transform = `translate3d(0,${dy}px,0)`;
        } else if (k.hasAttribute("data-drag-shift"))
          k.style.transform = "translate3d(0,0,0)";
      });
    }

    function paint(s: Session) {
      const dx = s.x - s.x0;
      const dy = s.y - s.y0;
      s.lean = nextLean(s.lean, s.x - s.lastX, s.calm);
      s.lastX = s.x;
      s.layer.style.transform = `translate3d(${dx}px,${dy}px,0)`;
      s.card.style.setProperty("--drag-lean", `${s.lean.toFixed(2)}deg`);
    }

    function setOverNode(s: Session, node: Element | null) {
      if (s.overNode === node) return;
      s.overNode?.removeAttribute("data-drag-over");
      s.overNode = node;
      if (node && node.getAttribute("data-drop") !== "timeline")
        node.setAttribute("data-drag-over", "");
    }

    /** One frame of the hand: where it is, what it is over, where the gap is. */
    function frame(s: Session, p: { x: number; y: number }) {
      s.x = p.x;
      s.y = p.y;
      paint(s);
      const hit = targetAt(s, p.x, p.y);
      let over = hit.over;
      if (over?.kind === "row" && over.node && s.node.contains(over.node))
        over = null;
      let j = -1;
      if (s.sort && (!over || over.kind === "row")) {
        const q = s.sort;
        const k = sortIndexAt(
          q.rows,
          q.i,
          s.x,
          s.r0.top + (s.y - s.y0) + s.r0.height / 2,
          rectOf(s, q.list),
          q.pitch
        );
        if (k >= 0) {
          j = k;
          over =
            k === q.i
              ? null
              : {
                  kind: "row",
                  id: q.rows[k].id,
                  node: q.list,
                  order: q.rows.map((r) => r.id),
                  fromIx: q.i,
                  toIx: k,
                };
        }
      }
      if (s.sort && j !== s.j) {
        s.j = j;
        shiftRows(s, j);
      }
      setOverNode(s, over && over.kind !== "row" ? (over.node ?? null) : null);
      const says = dragSays(over);
      if (s.tag.textContent !== says) {
        s.tag.textContent = says;
        s.tag.classList.toggle("is-on", !!says);
      }
      const changed = !sameOver(s.over, over);
      s.over = over;
      if (changed) {
        const item = s.item;
        const mode = s.mode;
        setDrag({ item, mode, over });
      }
      return hit.el;
    }

    /** Edge autoscroll for the scroller under the hand; true if it moved. */
    function autoscroll(s: Session, el: Element | null) {
      const sc = scrollerOf(s, el);
      if (!sc) return false;
      const r = rectOf(s, sc);
      const v = edgeScroll(s.y, r.top, r.bottom);
      if (!v) return false;
      const before = sc.scrollTop;
      sc.scrollTop += v;
      if (sc.scrollTop === before) return false;
      // the grid moved under cached rects: measure again next time
      s.rects.clear();
      if (s.sort)
        s.rects.set(s.sort.list, box(s.sort.list.getBoundingClientRect()));
      return true;
    }

    /* The one frame loop. Runs only while a point is fresh or the hand sits
       in an edge band; a pointer held still elsewhere schedules nothing. */
    function tick() {
      raf.current = 0;
      const p = point.current;
      const a = armed.current;
      if (a && !S.current) {
        if (!p.fresh) return;
        p.fresh = false;
        if (Math.abs(p.x - a.x0) + Math.abs(p.y - a.y0) < DRAG_THRESHOLD_PX)
          return;
        armed.current = null;
        const s = lift(a, p.x, p.y);
        if (!s) return;
        S.current = s;
        setDrag({ item: s.item, mode: s.mode, over: null });
        try {
          window.getSelection()?.removeAllRanges();
        } catch {
          /* none */
        }
      }
      const s = S.current;
      if (!s) return;
      p.fresh = false;
      const el = frame(s, p);
      // a hand held in an edge band keeps the grid moving: one more frame
      if (autoscroll(s, el)) raf.current = window.requestAnimationFrame(tick);
    }

    function request() {
      if (!raf.current) raf.current = window.requestAnimationFrame(tick);
    }

    function cleanup(s: Session | null) {
      if (!s) return;
      setOverNode(s, null);
      s.sort?.kids.forEach((k) => {
        if (k.hasAttribute("data-drag-shift")) {
          k.removeAttribute("data-drag-shift");
          k.style.transform = "";
        }
      });
      s.node.removeAttribute("data-drag-slot");
      s.layer.remove();
      if (!S.current) s.scope.classList.remove("is-drag-active");
    }

    /* Fly the lifted card to a rect (viewport), then run done(). */
    function flyTo(
      s: Session,
      rect: { left: number; top: number } | null,
      done: () => void,
      fade?: boolean
    ) {
      if (s.calm || !rect) {
        done();
        return;
      }
      const dx = rect.left - s.r0.left;
      const dy = rect.top - s.r0.top;
      s.layer.classList.add("is-settling");
      s.card.classList.remove("is-up");
      if (fade) s.layer.classList.add("is-fading");
      s.card.style.setProperty("--drag-lean", "0deg");
      s.layer.style.transform = `translate3d(${dx}px,${dy}px,0)`;
      let fired = false;
      const fin = () => {
        if (fired) return;
        fired = true;
        done();
      };
      s.layer.addEventListener("transitionend", (e) => {
        if (e.target === s.layer && e.propertyName === "transform") fin();
      });
      window.setTimeout(fin, SETTLE_FALLBACK_MS);
    }

    /* After a reorder the source may sit elsewhere than the gap: it travels
       from where the card was to where it is — never a jump. */
    function settleSource(
      node: HTMLElement,
      from: { left: number; top: number }
    ) {
      if (!node.isConnected || calmNow()) return;
      const r = node.getBoundingClientRect();
      const dx = from.left - r.left;
      const dy = from.top - r.top;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      node.style.transition = "none";
      node.style.transform = `translate3d(${dx}px,${dy}px,0)`;
      void node.offsetHeight;
      node.setAttribute("data-drag-flip", "");
      node.style.transition = "";
      node.style.transform = "";
      window.setTimeout(() => node.removeAttribute("data-drag-flip"), 300);
    }

    function end(commit: boolean, e?: PointerEvent) {
      const s = S.current;
      armed.current = null;
      if (raf.current) {
        window.cancelAnimationFrame(raf.current);
        raf.current = 0;
      }
      if (!s) return;
      if (commit) {
        const p = e ? { x: e.clientX, y: e.clientY } : { x: s.x, y: s.y };
        frame(s, p);
      }
      const over = commit ? s.over : null;
      S.current = null;
      swallowUntil.current = performance.now() + 350;
      setDrag(null);
      const lr = s.layer.getBoundingClientRect();
      const was = { left: lr.left, top: lr.top };

      if (over && over.kind === "row" && s.sort && over.toIx != null) {
        /* Into the gap: land where the rows made room, then commit. */
        const q = s.sort;
        const j = over.toIx;
        const list = q.list.getBoundingClientRect();
        const top =
          list.top +
          (j > q.i ? q.rows[j].top + q.rows[j].h - s.r0.height : q.rows[j].top);
        flyTo(s, { left: s.r0.left, top }, () => {
          const node = s.node;
          let tidied = false;
          const mo = new MutationObserver(() => tidy());
          const tidy = () => {
            if (tidied) return;
            tidied = true;
            mo.disconnect();
            cleanup(s);
            settleSource(node, { left: s.r0.left, top });
          };
          mo.observe(q.list, { childList: true });
          dropRef.current(s.item, over, s.mode);
          window.requestAnimationFrame(() =>
            window.requestAnimationFrame(tidy)
          );
        });
        return;
      }
      if (over) {
        /* A slot, a day, a project: commit, then the card flies into what the
           drop made (the new block) or quietly lands where it is. */
        dropRef.current(s.item, over, s.mode);
        const id = s.item.id;
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => {
            let land: Element | null = null;
            if (over.kind === "timeline" && over.node) {
              land =
                Array.from(
                  over.node.querySelectorAll(
                    `[data-drag-id="${CSS.escape(id)}"]`
                  )
                ).find((n) => n !== s.node && !s.layer.contains(n)) ?? null;
            }
            if (land) {
              const target = land;
              const lr2 = target.getBoundingClientRect();
              target.setAttribute("data-drag-landing", "");
              flyTo(s, { left: lr2.left, top: lr2.top }, () => {
                target.removeAttribute("data-drag-landing");
                cleanup(s);
              });
            } else flyTo(s, was, () => cleanup(s), true);
          })
        );
        return;
      }
      /* Missed (or Esc): the card travels back to where it was picked up. */
      if (s.sort) shiftRows(s, -1);
      flyTo(s, { left: s.r0.left, top: s.r0.top }, () => cleanup(s));
    }

    function move(e: PointerEvent) {
      if (!armed.current && !S.current) return;
      if (S.current && e.cancelable) e.preventDefault();
      point.current = { x: e.clientX, y: e.clientY, fresh: true };
      request();
    }
    function up(e: PointerEvent) {
      if (!S.current) {
        armed.current = null;
        return;
      }
      end(true, e);
    }
    function cancel() {
      if (S.current) end(false);
      armed.current = null;
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape" && (S.current || armed.current)) {
        e.stopPropagation();
        cancel();
      }
    }
    /* A drag is not a click on the row it started from. */
    function click(e: MouseEvent) {
      if (performance.now() < swallowUntil.current) {
        e.stopPropagation();
        e.preventDefault();
      }
    }
    /* The page moved under the cached rects. */
    function invalidate() {
      const s = S.current;
      if (!s) return;
      s.rects.clear();
      if (s.sort)
        s.rects.set(s.sort.list, box(s.sort.list.getBoundingClientRect()));
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
    window.addEventListener("click", click, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("scroll", invalidate, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", invalidate);
    return () => {
      if (raf.current) window.cancelAnimationFrame(raf.current);
      raf.current = 0;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("click", click, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("scroll", invalidate, { capture: true });
      window.removeEventListener("resize", invalidate);
      const s = S.current;
      S.current = null;
      cleanup(s);
    };
  }, []);

  /* Spread onto any element that should be draggable. */
  const dragProps = useCallback<DragProps>(
    (item, mode = "place") => ({
      "data-drag-src": "",
      "data-drag-id": item.id,
      onPointerDown: (e) => {
        if (e.button !== 0 || e.pointerType === "touch") return;
        const t = e.target as Element;
        if (t.closest?.("input, textarea, select, [contenteditable=true]"))
          return;
        armed.current = {
          item,
          mode,
          x0: e.clientX,
          y0: e.clientY,
          el: e.currentTarget,
        };
      },
    }),
    []
  );

  return { drag, dragProps };
}
