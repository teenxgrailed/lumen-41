"use client";

/* THE FOCUS WINDOW, desktop face (prototype focus.jsx `FocusWindow`): a
   window over the app, 720 wide, on the painted sky. Esc, the backdrop and
   the round button fold it away (a running session keeps going in the
   sidebar pill); Tab stays inside; focus returns to the pill. */
import { type KeyboardEvent, useEffect, useRef } from "react";

import { createPortal } from "react-dom";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { useExit } from "../ctx/useExit";
import { PxSky } from "../scenes";
import { FocusView } from "./FocusViews";
import { win } from "./strings";
import type { FocusController } from "./useFocusController";

const TABBABLE = "button:not([disabled]), input, textarea, [tabindex='0']";

export function FocusWindow({ ctl }: { ctl: FocusController }) {
  const container = useV3PortalContainer();
  const [shown, leaving] = useExit(ctl.open, 180);
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(ctl.close);
  close.current = ctl.close;

  // Esc: setup and end close, a running session minimises.
  useEffect(() => {
    if (!ctl.open) return undefined;
    const key = (e: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // A menu above the window takes its own Esc first.
      if (document.querySelector("[data-v3-portals] [role='menu']")) return;
      e.preventDefault();
      e.stopPropagation();
      close.current();
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [ctl.open]);

  // Focus moves into the window when it opens and back to the pill after.
  useEffect(() => {
    if (!ctl.open) {
      const pill = document.querySelector<HTMLElement>("[data-sb-focus]");
      if (pill && box.current?.contains(document.activeElement))
        pill.focus({ preventScroll: true });
      return undefined;
    }
    const t = window.setTimeout(() => {
      const el =
        box.current?.querySelector<HTMLElement>("[data-fc-autofocus]") ??
        box.current?.querySelector<HTMLElement>("button");
      el?.focus({ preventScroll: true });
    }, 30);
    return () => window.clearTimeout(t);
  }, [ctl.open, ctl.view]);

  if (!shown || !container) return null;

  const trap = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !box.current) return;
    const list = Array.from(
      box.current.querySelectorAll<HTMLElement>(TABBABLE)
    );
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className={"fc-scrim" + (leaving ? " is-leaving" : "")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) ctl.close();
      }}
      data-fc-scrim=""
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={ctl.view === "run" ? win.focus_session : win.focus}
        onKeyDown={trap}
        className={"fc-window" + (leaving ? " is-leaving" : "")}
        data-fc-window={ctl.view}
      >
        <PxSky variant="a" radius={22}>
          <div className="fc-scroll scroll-inner nx-scroll">
            <FocusView ctl={ctl} />
          </div>
        </PxSky>
      </div>
    </div>,
    container
  );
}
