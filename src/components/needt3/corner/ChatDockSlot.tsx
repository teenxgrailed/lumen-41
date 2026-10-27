"use client";

import {
  type KeyboardEvent as ReactKeyEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";

import {
  CHAT_DOCK_MAX,
  CHAT_DOCK_MIN,
  CHAT_DOCK_W,
} from "@/lib/assistant-position";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { rowOf, setRowMotion } from "../shell/row-motion";

/** The dock card's exit (chat.css v3-ask-dock-out 180ms, +40ms slack). */
export const PANEL_EXIT_MS = 220;

/** One arrow-key step of the resize edge. */
const STEP = 16;

/**
 * The column Ask Needt docks into: the last child of the shell's main row
 * (prototype App.jsx `data-chat-dock`), the right-hand twin of the left rail
 * (`RailColumn`). It reads `askOpen` itself, so opening the panel re-renders
 * this one element and not the shell around it.
 *
 * Like the rail, the column's width changes in one step (a width transition
 * re-lays-out the page, and every ResizeObserver in it, on every frame) and
 * the glide is played on the page by CSS (shell-motion.css), keyed by
 * `data-motion` on the row, which is written here in the same commit as the
 * width. The panel inside fades and slides 12px, as the rail does.
 *
 * The width is the person's: dragged from the left edge (`ResizeEdge`),
 * remembered, and published on the row as `--ask-w` for the page's reveal.
 *
 * On the way out the column gives its width back at once and does not clip, so
 * the panel (still mounted for `PANEL_EXIT_MS` by the corner) leaves over the
 * page that is coming back under it. The column sits above the page for that.
 *
 * Below 1100 px the panel is a sheet over a scrim and the page keeps its
 * width; the phone draws its own Ask. The slot is always in the row so
 * opening it never moves the page's chain.
 */
export function ChatDockSlot({
  phone,
  narrow,
  slotRef,
}: {
  phone: boolean;
  narrow: boolean;
  slotRef: Ref<HTMLDivElement>;
}) {
  const asked = useNeedt3Ui((s) => s.askOpen);
  const width = useNeedt3Ui((s) => s.askWidth);
  const docked = asked && !phone && !narrow;
  const el = useRef<HTMLDivElement | null>(null);
  const was = useRef(docked);

  // The shell's own ref (a state setter) and this one are both wanted.
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      el.current = node;
      if (typeof slotRef === "function") slotRef(node);
      else if (slotRef) {
        (slotRef as { current: HTMLDivElement | null }).current = node;
      }
    },
    [slotRef]
  );

  // The page's reveal on the way out (shell-motion.css) needs the width too.
  useLayoutEffect(() => {
    rowOf(el.current)?.style.setProperty("--ask-w", `${width}px`);
  }, [width]);

  useLayoutEffect(() => {
    if (was.current === docked) return;
    was.current = docked;
    setRowMotion(rowOf(el.current), docked ? "dock-in" : "dock-out");
  }, [docked]);

  return (
    <div
      ref={setRef}
      data-chat-dock
      className="chat-dock-slot"
      style={
        narrow || phone
          ? { flex: "none", width: 0 }
          : {
              flex: "none",
              display: "flex",
              justifyContent: "flex-end",
              backgroundColor: docked ? "var(--background)" : "transparent",
              width: docked ? width : 0,
              // At rest open the column clips the panel's slide; shut it
              // clips nothing, so the panel can leave over the page.
              overflow: docked ? "hidden" : "visible",
              contain: "layout",
            }
      }
    >
      {docked ? <ResizeEdge /> : null}
    </div>
  );
}

/**
 * The dock's left edge: a drag handle that is also a keyboard separator
 * (arrows move it, Home/End jump to the bounds) and gives the default width
 * back on a double click. The width is the distance from the pointer to the
 * row's right edge, kept between `CHAT_DOCK_MIN` and `CHAT_DOCK_MAX`.
 */
function ResizeEdge() {
  const width = useNeedt3Ui((s) => s.askWidth);
  const setWidth = useNeedt3Ui((s) => s.setAskWidth);
  const drag = useRef(false);

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const row = rowOf(e.currentTarget);
    const right = row ? row.getBoundingClientRect().right : window.innerWidth;
    setWidth(right - e.clientX);
  };
  const stop = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = false;
    delete e.currentTarget.dataset.dragging;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };
  const key = (e: ReactKeyEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") setWidth(width + STEP);
    else if (e.key === "ArrowRight") setWidth(width - STEP);
    else if (e.key === "Home") setWidth(CHAT_DOCK_MIN);
    else if (e.key === "End") setWidth(CHAT_DOCK_MAX);
    else return;
    e.preventDefault();
  };
  return (
    <div
      className="chat-dock-edge"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize Ask Needt"
      aria-valuemin={CHAT_DOCK_MIN}
      aria-valuemax={CHAT_DOCK_MAX}
      aria-valuenow={width}
      tabIndex={0}
      data-chat-dock-edge
      onPointerDown={(e) => {
        drag.current = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        e.currentTarget.dataset.dragging = "";
        e.preventDefault();
      }}
      onPointerMove={move}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={() => setWidth(CHAT_DOCK_W)}
      onKeyDown={key}
    />
  );
}
