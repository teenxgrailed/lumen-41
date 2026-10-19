"use client";

import { type ReactNode, useEffect, useRef } from "react";

import { createPortal } from "react-dom";

import type { StarterScreen } from "@/lib/starter-game";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { AiOrb } from "../orb/AiOrb";
import { SgIcon } from "./SgIcon";
import { SG_ENTRY } from "./model";

/**
 * THE GAME'S SHELL (sg-game.jsx `SgGame` frame): a header with the entry's
 * title, three step marks and a close button, over a scrolling body. On
 * desktop it is a 960 x 680 sheet over a scrim; on the phone it fills the
 * screen. Escape closes it. It is a layer of the v3 scope, so it wears the
 * theme the screen under it wears.
 */
export function SgShell({
  entry,
  phone,
  step,
  onClose,
  children,
}: {
  entry: StarterScreen;
  phone: boolean;
  /** 1 = chat, 2 = sort, 3 = summary. */
  step: 1 | 2 | 3;
  onClose: () => void;
  children: ReactNode;
}) {
  const container = useV3PortalContainer();
  const shell = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    shell.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      back?.focus?.();
    };
  }, []);

  if (!container) return null;
  const frame = (
    <div
      ref={shell}
      className="sg-shell"
      role="dialog"
      aria-modal="true"
      aria-label="Get started with Needt"
      tabIndex={-1}
      data-sg-shell=""
    >
      <div className="sg-head">
        <span className="sg-orb">
          <AiOrb size={22} tile={false} />
        </span>
        <b>{SG_ENTRY[entry].title}</b>
        <span className="sg-steps" aria-label={`Step ${step} of 3`}>
          {[1, 2, 3].map((k) => (
            <i key={k} className={k <= step ? "on" : ""} />
          ))}
        </span>
        <button
          type="button"
          className="sg-x"
          aria-label="Close"
          data-sg="close"
          onClick={onClose}
        >
          <SgIcon n="x" />
        </button>
      </div>
      <div className="sg-body">{children}</div>
    </div>
  );
  return createPortal(
    <div
      className={`sg-layer ${phone ? "sg-phone" : "sg-desk"}`}
      data-sg-layer=""
    >
      {phone ? frame : <div className="sg-scrim">{frame}</div>}
    </div>,
    container
  );
}
