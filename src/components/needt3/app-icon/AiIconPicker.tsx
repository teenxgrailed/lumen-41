"use client";

import { useEffect, useState } from "react";

import {
  type AppIconDef,
  appIconLocked,
  appIconSrc,
} from "@/lib/needt3/app-icon";

/**
 * The app icon picker, ported 1:1 from the design pack
 * (additions/app-icon/ai-picker.jsx). `intro` is the one-time "New icons for
 * Needt" popup; the same sheet is reachable from Settings -> Appearance ->
 * App icon. Free people can use the free icons; Pro icons carry PRO and open
 * the paywall. Which icon is saved, the toast and the analytics belong to the
 * host (AppIconHost): this is the picture.
 */

const AiCheck = () => (
  <svg
    viewBox="0 0 16 16"
    width="13"
    height="13"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);
const AiX = () => (
  <svg
    viewBox="0 0 16 16"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export interface AiIconPickerProps {
  icons: readonly AppIconDef[];
  current: string;
  /** The plan kind: "free" locks the Pro icons. */
  plan: string;
  onPick: (id: string) => void;
  onUpgrade: (id: string) => void;
  onClose: () => void;
  intro?: boolean;
}

export function AiIconPicker({
  icons,
  current,
  plan,
  onPick,
  onUpgrade,
  onClose,
  intro,
}: AiIconPickerProps) {
  const [sel, setSel] = useState(current || "midnight");
  const cur = icons.find((x) => x.id === sel) || icons[0];
  const free = plan === "free";
  const pick = (ic: AppIconDef) => {
    if (appIconLocked(ic.id, plan)) {
      onUpgrade(ic.id);
      return;
    }
    setSel(ic.id);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const group = (dark: boolean) => icons.filter((x) => x.dark === dark);
  const opt = (ic: AppIconDef) => (
    <button
      key={ic.id}
      type="button"
      role="radio"
      aria-checked={sel === ic.id}
      data-ai-icon={ic.id}
      className="ai-opt"
      onClick={() => pick(ic)}
      aria-label={`${ic.name}${ic.tier === "pro" && free ? ", Pro" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={appIconSrc(ic.id)} alt="" draggable="false" />
      {ic.tier === "pro" && free ? <span className="ai-badge">PRO</span> : null}
      {sel === ic.id ? (
        <span className="ai-check">
          <AiCheck />
        </span>
      ) : null}
      <span className="n">{ic.name}</span>
    </button>
  );
  return (
    <div className="ai-sheet" role="dialog" aria-label="App icon">
      <div className="ai-grab" />
      <div className="ai-hero">
        <div
          className="ai-hero-bg"
          style={{ backgroundImage: `url(${appIconSrc(cur.id)})` }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={cur.id} src={appIconSrc(cur.id)} alt={`${cur.name} icon`} />
        <div className="ai-hero-name">
          {cur.name}
          {cur.tier === "pro" ? <span>Pro</span> : <span>Free</span>}
        </div>
        <button
          type="button"
          className="ai-x"
          aria-label="Close"
          onClick={onClose}
        >
          <AiX />
        </button>
      </div>
      <div className="ai-body">
        <h3 className="ai-h">{intro ? "New icons for Needt" : "App icon"}</h3>
        <p className="ai-p">
          {intro
            ? "Thirteen ways to wear Needt on your home screen and dock. Pick one — you can change it any time in Settings → Appearance."
            : "Changes the icon on your home screen, dock and in the app."}
        </p>
        <div className="ai-sec">Dark</div>
        <div className="ai-grid" role="radiogroup" aria-label="Dark icons">
          {group(true).map(opt)}
        </div>
        <div className="ai-sec">Light</div>
        <div className="ai-grid" role="radiogroup" aria-label="Light icons">
          {group(false).map(opt)}
        </div>
      </div>
      <div className="ai-foot">
        <small>
          {free
            ? "4 icons are free. Pro unlocks all 13."
            : "All 13 icons are included in your plan."}
        </small>
        {intro ? (
          <button type="button" className="ai-btn" onClick={onClose}>
            Not now
          </button>
        ) : null}
        <button
          type="button"
          className="ai-btn is-primary"
          data-ai-apply
          onClick={() => onPick(sel)}
          disabled={sel === current && !intro}
        >
          Use {cur.name}
        </button>
      </div>
    </div>
  );
}
