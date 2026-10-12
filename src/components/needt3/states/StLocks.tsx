"use client";

import { useEffect, useState } from "react";

import { FiLock } from "react-icons/fi";

import { newDate } from "@/lib/date-utils";
import { usePlan } from "@/lib/needt3/hooks/plan";

import { useDesignV3 } from "../root/V3Root";
import { lockRules } from "./status";

const LOCK = "data-st-lock";

interface Tip {
  text: string;
  x: number;
  right: number;
  edge: boolean;
  y: number;
  up: boolean;
  top: number;
}

/**
 * Marks controls that the account cannot use right now (trial ended, AI
 * paused) with `data-st-lock`, blocks their clicks and explains why in a
 * tooltip (states.jsx `StLocks`). Screens opt in by tagging the control:
 * `data-agent-plan`, `data-dc-style`, `data-cn-connect`. Mount once inside
 * `V3Root`; it only touches elements inside the `.needt-v3` scope.
 */
export function StLocks() {
  const enabled = useDesignV3();
  const plan = usePlan();
  const rules = enabled ? lockRules(plan.data, newDate().getTime()) : [];
  const key = JSON.stringify(rules);
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    setTip(null);
    const scope = document.querySelector<HTMLElement>(".needt-v3");
    if (!scope) return undefined;
    const wanted: Array<[string, string]> = JSON.parse(key);
    let raf = 0;
    const apply = () => {
      raf = 0;
      const want = new Map<Element, string>();
      for (const [selector, why] of wanted)
        scope.querySelectorAll(selector).forEach((el) => {
          if (!want.has(el)) want.set(el, why);
        });
      scope.querySelectorAll(`[${LOCK}]`).forEach((el) => {
        if (!want.has(el)) el.removeAttribute(LOCK);
      });
      want.forEach((why, el) => {
        if (el.getAttribute(LOCK) !== why) el.setAttribute(LOCK, why);
      });
    };
    apply();
    if (!wanted.length) return undefined;
    const observer = new MutationObserver(() => {
      if (!raf) raf = window.requestAnimationFrame(apply);
    });
    observer.observe(scope, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
      scope
        .querySelectorAll(`[${LOCK}]`)
        .forEach((el) => el.removeAttribute(LOCK));
    };
  }, [key]);

  useEffect(() => {
    if (key === "[]") return undefined;
    const locked = (target: EventTarget | null) =>
      target instanceof Element ? target.closest(`[${LOCK}]`) : null;
    const show = (el: Element) => {
      const r = el.getBoundingClientRect();
      setTip({
        text: el.getAttribute(LOCK) ?? "",
        x: r.left + r.width / 2,
        right: window.innerWidth - r.right,
        edge: r.left + r.width / 2 > window.innerWidth - 170,
        y: r.bottom + 8,
        up: r.bottom > window.innerHeight - 80,
        top: r.top - 8,
      });
    };
    const over = (event: MouseEvent) => {
      const el = locked(event.target);
      if (el) show(el);
      else setTip(null);
    };
    const block = (event: Event) => {
      const el = locked(event.target);
      if (!el) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.type === "click") show(el);
    };
    const types = ["click", "mousedown", "pointerdown"] as const;
    document.addEventListener("mouseover", over);
    types.forEach((type) => document.addEventListener(type, block, true));
    return () => {
      document.removeEventListener("mouseover", over);
      types.forEach((type) => document.removeEventListener(type, block, true));
    };
  }, [key]);

  if (!tip) return null;
  return (
    <div
      className="st-locktip"
      role="tooltip"
      data-st-locktip
      style={
        tip.edge
          ? {
              right: Math.max(8, tip.right),
              top: tip.up ? tip.top : tip.y,
              transform: tip.up ? "translateY(-100%)" : "none",
            }
          : {
              left: tip.x,
              top: tip.up ? tip.top : tip.y,
              transform: `translate(-50%, ${tip.up ? "-100%" : "0"})`,
            }
      }
    >
      <FiLock size={12} aria-hidden />
      {tip.text}
    </div>
  );
}
