"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { createPortal } from "react-dom";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { noteTipHidden, tipDelay } from "./tip-timing";

const GAP = 6;
const EDGE = 8;

interface Placed {
  left: number;
  top: number;
  place: "top" | "bottom";
}

/**
 * The browser's own `title` tooltip is unstyled, slow in its own way and cannot
 * carry a shortcut. Mounted once in the shell, this hands every `title` under
 * the pointer to the same Craft-style tip as `Tooltip`: the attribute is set
 * aside while the pointer is over the element (so the native one never opens)
 * and put back when it leaves. Elements that need no tip say `data-no-tip`.
 */
export function TitleTips() {
  const portals = useV3PortalContainer();
  // Beside the portal layer, not in it: Esc asks that layer whether a sheet is
  // open by counting its children.
  const host = portals?.parentElement ?? null;
  const [tip, setTip] = useState<{ text: string; rect: DOMRect } | null>(null);
  const [open, setOpen] = useState(false);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!host) return undefined;
    let el: HTMLElement | null = null;
    let timer: number | undefined;
    let shown = false;
    // After a press or a scroll the tip stays away until the pointer re-enters.
    let quiet = false;

    const restore = () => {
      if (!el) return;
      const t = el.dataset.tipTitle;
      if (t !== undefined) {
        if (!el.hasAttribute("title")) el.setAttribute("title", t);
        delete el.dataset.tipTitle;
      }
    };
    const hide = (left: boolean) => {
      window.clearTimeout(timer);
      if (!shown) return;
      shown = false;
      setOpen(false);
      if (left) noteTipHidden(performance.now());
    };
    const end = () => {
      hide(true);
      restore();
      el = null;
      quiet = false;
    };
    const begin = (target: HTMLElement) => {
      const text = target.getAttribute("title");
      if (!text || !text.trim()) return;
      target.dataset.tipTitle = text;
      target.removeAttribute("title");
      el = target;
      quiet = false;
      const fire = () => {
        if (!el || quiet) return;
        shown = true;
        setTip({ text, rect: el.getBoundingClientRect() });
        setOpen(true);
      };
      const wait = tipDelay(performance.now());
      if (wait <= 0) fire();
      else timer = window.setTimeout(fire, wait);
    };

    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const target = e.target as Element | null;
      if (!target?.closest) return;
      if (el && el.contains(target)) return;
      if (el) end();
      const t = target.closest<HTMLElement>("[title]");
      if (t && !t.closest("[data-no-tip]")) begin(t);
    };
    const out = (e: PointerEvent) => {
      if (el && !el.contains(e.relatedTarget as Node | null)) end();
    };
    const away = () => {
      quiet = true;
      hide(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") away();
    };

    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("scroll", away, true);
    window.addEventListener("wheel", away, { passive: true });
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("wheel", away);
      document.removeEventListener("keydown", esc);
      end();
    };
  }, [host]);

  // Measured once the text is in, so the tip can centre and stay on screen.
  useLayoutEffect(() => {
    if (!tip || !box.current) return;
    const { width, height } = box.current.getBoundingClientRect();
    const above = tip.rect.top - height - GAP >= EDGE;
    const left = Math.max(
      EDGE,
      Math.min(
        tip.rect.left + tip.rect.width / 2 - width / 2,
        window.innerWidth - width - EDGE
      )
    );
    setPlaced({
      left,
      top: above ? tip.rect.top - height - GAP : tip.rect.bottom + GAP,
      place: above ? "top" : "bottom",
    });
  }, [tip]);

  if (!host) return null;
  return createPortal(
    <span
      ref={box}
      className="nt-tooltip nt-tip-float"
      role="tooltip"
      data-place={placed?.place ?? "top"}
      data-open={open && placed ? "" : undefined}
      style={{ left: placed?.left ?? 0, top: placed?.top ?? 0 }}
    >
      {tip?.text}
    </span>,
    host
  );
}
