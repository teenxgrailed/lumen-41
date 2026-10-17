"use client";

import { type Ref, useCallback, useLayoutEffect, useRef } from "react";

import { CHAT_DOCK_W } from "@/lib/assistant-position";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { rowOf, setRowMotion } from "../shell/row-motion";

/** The dock card's exit (chat.css v3-chat-spring-out 200ms, +20ms slack). */
export const PANEL_EXIT_MS = 220;

/**
 * The column Ask Needt docks into: the last child of the shell's main row
 * (prototype App.jsx `data-chat-dock`). It reads `askOpen` itself, so opening
 * the panel re-renders this one element and not the shell around it.
 *
 * The prototype runs the column's width 0 ↔ 360 over 220ms while the card
 * springs in from the corner, and the page glides with it. A width transition
 * re-lays-out the page (and every ResizeObserver in it) on every frame, which
 * was the stutter, so the width changes in one step instead and the glide is
 * played on the page by CSS (shell-motion.css): the same 220ms and easing,
 * from a clip, keyed by `data-motion` on the row, which is written here in the
 * same commit as the width. The card inside moves with transform and opacity
 * only (chat.css `v3-chat-spring-in` / `-out`).
 *
 * On the way out the column gives its width back at once and does not clip, so
 * the card (still mounted for `PANEL_EXIT_MS` by the corner) leaves over the
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
              width: docked ? CHAT_DOCK_W : 0,
              // At rest open the column clips the card's overshoot; shut it
              // clips nothing, so the card can leave over the page.
              overflow: docked ? "hidden" : "visible",
              contain: "layout",
            }
      }
    />
  );
}
