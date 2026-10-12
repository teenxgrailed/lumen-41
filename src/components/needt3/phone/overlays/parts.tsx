"use client";

import type { ReactNode } from "react";

import { LuCheck, LuChevronDown } from "react-icons/lu";

import { pkCx } from "../kit";

/* The small pieces the overlays share (phone-overlays.jsx Pov*). Styles:
   the vendored styles/phone-overlays.css (`pov-*`). */

/** One choice in a picker sheet: the words, a hint, a check when chosen. */
export function PovPickRow({
  on,
  onClick,
  hint,
  children,
  data,
}: {
  on?: boolean;
  onClick: () => void;
  hint?: ReactNode;
  children: ReactNode;
  data?: Record<string, string>;
}) {
  return (
    <button
      type="button"
      className={pkCx("pov-pick-row", on && "is-on")}
      aria-pressed={!!on}
      onClick={onClick}
      {...(data ?? {})}
    >
      <span className="pov-pick-text">
        <span className="pov-pick-label">{children}</span>
        {hint ? <span className="pov-pick-hint">{hint}</span> : null}
      </span>
      <span className="pov-pick-check" aria-hidden="true">
        {on ? <LuCheck size={18} /> : null}
      </span>
    </button>
  );
}

/** A fact row: label, value, and (open) the choices under it. */
export function PovFact({
  id,
  label,
  value,
  muted,
  late,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  value: ReactNode;
  muted?: boolean;
  late?: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={pkCx("pov-fact", open && "is-open")} data-pov-fact={id}>
      <button
        type="button"
        className="pov-fact-row"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="pov-fact-label">{label}</span>
        <span
          className={pkCx(
            "pov-fact-value",
            muted && "is-muted",
            late && "is-late"
          )}
        >
          {value}
        </span>
        <span className="pov-fact-chev" aria-hidden="true">
          <LuChevronDown size={14} />
        </span>
      </button>
      {open ? <div className="pov-opts pk-no-drag">{children}</div> : null}
    </div>
  );
}

/** One round choice (a day, an hour, a project …). */
export function PovOpt({
  on,
  onClick,
  children,
  hue,
}: {
  on?: boolean;
  onClick: () => void;
  children: ReactNode;
  hue?: string;
}) {
  return (
    <button
      type="button"
      className={pkCx("pov-opt", on && "is-on")}
      aria-pressed={!!on}
      onClick={onClick}
      style={hue ? ({ "--hue": hue } as React.CSSProperties) : undefined}
    >
      {hue ? <span className="pov-hue" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
