"use client";

import { type RefObject, useEffect, useState } from "react";

import { createPortal } from "react-dom";

import { PERSONAL_PRESETS, type PersonalPreset } from "@/lib/personal-time";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { lengthLabel } from "./menu-items";

const MENU_W = 188;

/**
 * The empty-slot menu. Clicking an empty slot on the calendar opens a draft
 * event; beside it this lists the personal time presets, so "Lunch here" is
 * one tap instead of a typed title. It is drawn in the shell's portal (the
 * grid column clips and contains its children) and follows the draft while
 * the strip scrolls.
 *
 * Mouse down is not allowed to move focus: the draft saves or drops itself
 * when its input blurs, and the menu must still be there for the click.
 */
export function PersonalSlotMenu({
  anchor,
  onPick,
}: {
  anchor: RefObject<HTMLElement | null>;
  onPick: (preset: PersonalPreset) => void;
}) {
  const container = useV3PortalContainer();
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  // After the commit, not in the layout phase: the draft that owns the anchor
  // attaches its ref after its children's layout effects have run.
  useEffect(() => {
    const place = () => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const right = r.right + 8 + MENU_W <= window.innerWidth - 8;
      setAt({
        left: right ? r.right + 8 : Math.max(8, r.left - 8 - MENU_W),
        top: Math.max(8, Math.min(r.top, window.innerHeight - 8 - 7 * 32 - 44)),
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor]);
  if (!container || !at) return null;
  return createPortal(
    <div
      role="menu"
      aria-label="Keep this time for you"
      data-pb-slot-menu=""
      className="nx-pop pb-slotmenu"
      style={{ left: at.left, top: at.top, width: MENU_W }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="pb-slotmenu-head">Or keep this time for you</span>
      {PERSONAL_PRESETS.map((preset) => (
        <button
          key={preset.kind}
          type="button"
          role="menuitem"
          data-pb-preset={preset.kind}
          className="pb-slotmenu-row"
          onClick={() => onPick(preset)}
        >
          <span aria-hidden="true" className="pb-glyph">
            {preset.emoji}
          </span>
          <span className="pb-slotmenu-name">{preset.title}</span>
          <span className="pb-slotmenu-len">{lengthLabel(preset.minutes)}</span>
        </button>
      ))}
    </div>,
    container
  );
}
