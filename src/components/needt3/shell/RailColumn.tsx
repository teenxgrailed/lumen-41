"use client";

import { type ReactNode, useLayoutEffect, useRef } from "react";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { rowOf, setRowMotion } from "./row-motion";

const EASE = "cubic-bezier(.2,.8,.2,1)";
/** The rail's slide (and the page's, see shell-motion.css). */
const SLIDE_MS = 260;

/**
 * The wide rail: a column of the main row that hides to width 0 (⌘\,
 * remembered) and is put away by Focus Mode.
 *
 * It reads `sidebarOpen` itself, so toggling the rail re-renders this column
 * and not the shell, the top bar or the page around it. The width changes in
 * one step; what moves is the page (a transform, written to the row as
 * `data-motion` in the same commit) and the rail inside the column (opacity
 * and a 12px slide, as in the prototype). The column does not clip while it
 * moves, so the rail stays under the page as the page's edge crosses it, and
 * goes `visibility: hidden` only once the slide has finished.
 */
export function RailColumn({
  focusMode,
  children,
}: {
  focusMode: boolean;
  children: ReactNode;
}) {
  const open = useNeedt3Ui((s) => s.sidebarOpen);
  const hidden = !open || focusMode;
  const col = useRef<HTMLDivElement>(null);
  const was = useRef(hidden);

  useLayoutEffect(() => {
    const row = rowOf(col.current);
    // A rail that comes back after the narrow float starts from rest.
    setRowMotion(row, null);
    return () => setRowMotion(row, null);
  }, []);

  useLayoutEffect(() => {
    if (was.current === hidden) return;
    was.current = hidden;
    setRowMotion(rowOf(col.current), hidden ? "rail-out" : "rail-in");
  }, [hidden]);

  return (
    <div
      ref={col}
      className={`shell-app-row-2 sb-shell${hidden ? " is-hidden" : ""}`}
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      style={{ width: hidden ? 0 : "var(--sidebar-w)" }}
    >
      <div
        className="sb-rail shell-app-rail"
        style={{
          opacity: hidden ? 0 : 1,
          transform: hidden ? "translateX(-12px)" : "none",
          pointerEvents: hidden ? "none" : "auto",
          visibility: hidden ? "hidden" : "visible",
          transition: hidden
            ? `opacity 180ms ease, transform ${SLIDE_MS}ms ${EASE}, visibility 0s linear ${SLIDE_MS}ms`
            : `opacity 220ms ease 40ms, transform ${SLIDE_MS}ms ${EASE}, visibility 0s`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
