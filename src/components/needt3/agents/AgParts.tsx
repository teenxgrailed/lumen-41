"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  createContext,
  useContext,
} from "react";

import { FiChevronRight } from "react-icons/fi";

import { formatDateToLocal, formatShortDate, newDate } from "@/lib/date-utils";

import { Art, type ArtName } from "../menu/Art";

/**
 * Each agent's own hue, the same one the Map draws it in. A mark only: a dot,
 * a rail, a ring, a thin line. Never a surface or a button (owner, 05.11.26).
 */
export const AGENT_HUES = [
  "rgb(255,138,92)",
  "rgb(139,140,255)",
  "rgb(230,230,236)",
  "rgb(76,195,138)",
  "rgb(245,165,36)",
  "rgb(199,125,255)",
  "rgb(53,194,193)",
] as const;
const NEUTRAL_HUE = "rgba(246,245,250,0.45)";

/** id and name → hue, in the order the overview lists the agents. */
export function agentHueMap(agents: { id: string; name: string }[]) {
  const map = new Map<string, string>();
  agents.forEach((a, i) => {
    const hue = AGENT_HUES[i % AGENT_HUES.length];
    map.set(a.id, hue);
    if (!map.has(a.name)) map.set(a.name, hue);
  });
  return map;
}

const HueContext = createContext<Map<string, string>>(new Map());
export const AgentHueProvider = HueContext.Provider;

/** The hue of an agent by id or name; a quiet grey for anyone else. */
export function useAgentHue() {
  const map = useContext(HueContext);
  return (key: string | null | undefined) =>
    (key ? map.get(key) : undefined) ?? NEUTRAL_HUE;
}

/** A square avatar in the agent's hue with its first letter. */
export function AgAvatar({
  name,
  hue,
  size = 40,
}: {
  name: string;
  hue: string;
  size?: number;
}) {
  return (
    <span
      className="ag-av"
      aria-hidden="true"
      style={{ background: hue, width: size, height: size }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export type AgTone =
  | "none"
  | "muted"
  | "accent"
  | "info"
  | "success"
  | "danger";

/** "5 Nov, 14:20": a day and a time, for rows and callouts. */
export function shortWhen(iso: string | null | undefined) {
  if (!iso) return "never";
  const date = newDate(iso);
  if (isNaN(date.getTime())) return "never";
  return `${formatShortDate(date)}, ${formatDateToLocal(date).slice(11, 16)}`;
}

/**
 * Up and Down move between the rows of a list, Home and End jump to its ends.
 * The rows are the list's own buttons (`.ag-main`, `.ag-thread`), so Tab still
 * walks into each row's actions.
 */
export function listKeys(e: KeyboardEvent<HTMLElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  const target = e.target as HTMLElement;
  if (target.closest("input, textarea, select, [contenteditable]")) return;
  const rows = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>(
      "button.ag-main, button.ag-thread"
    )
  );
  if (!rows.length) return;
  const at = rows.indexOf(target);
  let next = at;
  if (e.key === "Home") next = 0;
  else if (e.key === "End") next = rows.length - 1;
  else if (e.key === "ArrowDown") next = Math.min(rows.length - 1, at + 1);
  else next = at < 0 ? 0 : Math.max(0, at - 1);
  e.preventDefault();
  rows[next]?.focus();
}

/**
 * A section on the sky: a title and hint on the sky, the rows on one glass
 * panel under them (the Connections recipe: no card on a card, the panel is
 * the object, rows are hairlines inside it).
 */
export function AgSection({
  title,
  hint,
  action,
  children,
  attr,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  attr?: string;
}) {
  return (
    <section className="ag-sec nx-swap" {...(attr ? { [attr]: "" } : {})}>
      <div className="ag-sec-head">
        <span className="ag-sec-titles">
          <h2 className="ag-h">{title}</h2>
          {hint ? <p className="ag-hint">{hint}</p> : null}
        </span>
        {action}
      </div>
      <div className="ag-glass ag-panel">
        <div className="ag-list" onKeyDown={listKeys}>
          {children}
        </div>
      </div>
    </section>
  );
}

/**
 * One row at the Trash row geometry: a status mark, title over a quiet line,
 * actions on the right. With `onToggle` the text is a button and `detail`
 * opens under the row.
 */
export function AgRow({
  title,
  meta,
  tone = "none",
  actions,
  expanded,
  onToggle,
  detail,
}: {
  title: ReactNode;
  meta?: ReactNode;
  tone?: AgTone;
  actions?: ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  detail?: ReactNode;
}) {
  const body = (
    <>
      <span className={`ag-mark is-${tone}`} aria-hidden="true" />
      <span className="ag-text">
        <span className="ag-title">{title}</span>
        {meta ? <span className="ag-meta">{meta}</span> : null}
      </span>
      {onToggle ? (
        <FiChevronRight
          size={14}
          aria-hidden
          className={`ag-chev${expanded ? " is-open" : ""}`}
        />
      ) : null}
    </>
  );
  return (
    <div className="ag-item nx-swap" data-ag-row="">
      <div className="ag-row">
        {onToggle ? (
          <button
            type="button"
            className="ag-main"
            aria-expanded={Boolean(expanded)}
            onClick={onToggle}
          >
            {body}
          </button>
        ) : (
          <div className="ag-main">{body}</div>
        )}
        {actions ? <span className="ag-actions">{actions}</span> : null}
      </div>
      {expanded && detail ? <div className="ag-detail">{detail}</div> : null}
    </div>
  );
}

/** The empty state: a glass note on the sky, as Connections draws its own. */
export function AgEmpty({
  art,
  title,
  line,
  action,
}: {
  art: ArtName;
  title: string;
  line: string;
  action?: ReactNode;
}) {
  return (
    <div className="ag-glass cn-empty ag-empty nx-swap">
      <span className="ag-empty-in" data-ag-empty="">
        <span className="cn-screen-grid">
          <Art name={art} size={22} />
        </span>
        <span className="cn-screen-text">{title}</span>
        <span className="cn-screen-text-2">{line}</span>
        {action ? <span className="ag-empty-action">{action}</span> : null}
      </span>
    </div>
  );
}

/** A small button in the nx-btn family. */
export function AgBtn({
  children,
  tone = "secondary",
  pressed,
  disabled,
  onClick,
}: {
  children: ReactNode;
  tone?: "secondary" | "text" | "danger";
  disabled?: boolean;
  pressed?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`nx-btn nx-btn-sm nx-btn-${tone}`}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
