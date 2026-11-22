"use client";

import { type ReactNode, useEffect, useState } from "react";

import { LuPlay, LuSparkles } from "react-icons/lu";

/**
 * DESIGN EXPLORATION, local only (branch design/easy-start-row, never merged
 * as is). Three ways to draw a task row once "Always easy start" has turned a
 * task's first step (`entry`, 15 minutes or less) into the row's main text.
 * The toggle lives in the URL of a local page: `?esr=A|B|C` picks the variant
 * and `?ess=normal|simplified|suggest` the state. It does nothing anywhere but
 * 127.0.0.1 / localhost, and does nothing without `esr`.
 */
export type EsrVariant = "A" | "B" | "C";
export type EsrState = "normal" | "simplified" | "suggest";
export interface EsrConfig {
  variant: EsrVariant;
  state: EsrState;
}

const LOCAL = new Set(["127.0.0.1", "localhost"]);

export function useEasyStartRow(): EsrConfig | null {
  const [cfg, setCfg] = useState<EsrConfig | null>(null);
  useEffect(() => {
    if (!LOCAL.has(window.location.hostname)) return;
    const q = new URLSearchParams(window.location.search);
    const v = q.get("esr");
    if (v !== "A" && v !== "B" && v !== "C") return;
    const s = q.get("ess");
    setCfg({
      variant: v,
      state: s === "simplified" || s === "suggest" ? s : "normal",
    });
  }, []);
  return cfg;
}

/** A row takes part when it has a first step and is not closed. */
export function esrApplies(
  cfg: EsrConfig | null,
  v: { entry?: string | null; done?: boolean }
): boolean {
  if (!cfg || !v.entry || v.done) return false;
  return true;
}

const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

function Undo() {
  return (
    <button type="button" className="esr-undo" onClick={stop}>
      Undo
    </button>
  );
}

/**
 * The text of a row. `titleClass` is the row's own title class (desk or touch),
 * so the entry keeps the title's type and truncation.
 */
export function EsrText({
  cfg,
  title,
  entry,
  minutes,
  titleClass,
  trail,
}: {
  cfg: EsrConfig;
  title: string;
  entry: string;
  minutes: string | null;
  titleClass: string;
  trail?: ReactNode;
}) {
  const { variant, state } = cfg;

  if (state === "suggest")
    return (
      <span className="esr esr-line esr-suggest-line">
        <span className={`${titleClass} esr-grow`} title={title}>
          {title}
        </span>
        <button type="button" className="esr-suggest" onClick={stop}>
          <LuSparkles size={12} aria-hidden="true" className="esr-mark" />
          Упростить?
        </button>
        {trail}
      </span>
    );

  const undo = state === "simplified" ? <Undo /> : null;

  if (variant === "A")
    return (
      <span className="esr esr-col">
        <span className={titleClass} title={entry}>
          {entry}
        </span>
        <span className="esr-sub">
          <span className="esr-sub-text" title={title}>
            for: {title}
          </span>
          {undo}
        </span>
        {trail}
      </span>
    );

  if (variant === "B")
    return (
      <span className="esr esr-line esr-b">
        <span className="esr-crumb" title={title}>
          {title}
        </span>
        <span className={`${titleClass} esr-grow`} title={entry}>
          {entry}
        </span>
        {undo}
        {trail}
      </span>
    );

  return (
    <span className="esr esr-col">
      <span className="esr-sub">
        <span className="esr-sub-text" title={title}>
          {title}
        </span>
        {undo}
      </span>
      <span className="esr-line">
        <span className={`${titleClass} esr-grow`} title={entry}>
          {entry}
        </span>
        <button
          type="button"
          className="esr-start"
          aria-label="Start"
          onClick={stop}
        >
          <LuPlay size={12} aria-hidden="true" className="esr-mark" />
          <span className="esr-start-label">
            {minutes ? `Start · ${minutes}` : "Start"}
          </span>
        </button>
        {trail}
      </span>
    </span>
  );
}
