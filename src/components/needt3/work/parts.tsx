"use client";

import { type ReactNode, useState } from "react";

import { LuChevronDown, LuPlus } from "react-icons/lu";

import { Art, type ArtName } from "../menu/Art";
import { RichMenu, type RichMenuItem } from "../menu/RichMenu";

/** Progress ring ($P/work.jsx Ring): track + hue arc, `pct` 0…1. */
export function Ring({
  pct,
  hue,
  size = 22,
}: {
  pct: number;
  hue: string;
  size?: number;
}) {
  const r = size / 2 - 2.5;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="wk-ring"
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--fill-5)"
        strokeWidth="2.5"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={hue}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        className="wk-ring-fill"
      />
    </svg>
  );
}

/**
 * A section that folds ($P/HomeToday.jsx HdFold): a chevron, the name, a
 * quiet count, an optional note under the head.
 */
export function Fold({
  title,
  count,
  open,
  onToggle,
  tone,
  note,
  children,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  tone?: "late";
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="hd-fold">
      <header className="hd-fold-head">
        <button
          type="button"
          className={`hd-chev hd-fold-chev${open ? "" : " is-shut"}`}
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Fold" : "Unfold"} ${title}`}
        >
          <LuChevronDown size={14} aria-hidden />
        </button>
        <span
          onClick={onToggle}
          title={title.length > 32 ? title : undefined}
          className={`hd-fold-title${tone === "late" ? " is-late" : ""}`}
        >
          {title}
        </span>
        {count ? <span className="hd-fold-count">{count}</span> : null}
        <span className="hd-fold-action" />
      </header>
      {note ? <p className="hd-fold-note">{note}</p> : null}
      <div className={`nx-fold${open ? "" : " is-shut"}`} aria-hidden={!open}>
        <div className="hd-fold-body">{children}</div>
      </div>
    </section>
  );
}

/**
 * The first `cap` rows and a quiet "Show all N" ($P/HomeToday.jsx
 * HdCapped). Small overflows (≤ 5) are just shown.
 */
export function Capped<T>({
  list,
  render,
  cap = 50,
}: {
  list: readonly T[];
  render: (item: T) => ReactNode;
  cap?: number;
}) {
  const [all, setAll] = useState(false);
  const over = list.length > cap + 5;
  const shown = over && !all ? list.slice(0, cap) : list;
  return (
    <>
      {shown.map(render)}
      {over ? (
        <button
          type="button"
          className="nx-btn nx-btn-text nx-btn-sm hd-more"
          onClick={() => setAll(!all)}
          title={
            all
              ? `Show the first ${cap} only`
              : `${list.length - cap} more not shown`
          }
        >
          {all ? "Show fewer" : `Show all ${list.length}`}
        </button>
      ) : null}
    </>
  );
}

/** Empty state ($P/work.jsx WkEmpty): a picture, one line, one action. */
export function WkEmpty({
  art,
  title,
  line,
  cta,
  onClick,
}: {
  art: ArtName;
  title: string;
  line: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <div data-wk-empty="" className="wk-empty">
      <Art name={art} size={56} />
      <span className="wk-empty-title">{title}</span>
      <span className="wk-empty-line">{line}</span>
      <button
        type="button"
        className="nx-btn nx-btn-secondary wk-empty-cta"
        onClick={onClick}
      >
        <LuPlus size={14} aria-hidden />
        {cta}
      </button>
    </div>
  );
}

/**
 * The page header's "+" ($P/Sidebar.jsx PageAddButton): with `items` it
 * opens the page's small create menu, with `onClick` it creates directly.
 */
export function PageAddButton({
  label,
  items,
  onClick,
}: {
  label: string;
  items?: readonly RichMenuItem[];
  onClick?: () => void;
}) {
  const button = (open: boolean) => (
    <button
      type="button"
      aria-label={label}
      title={open ? undefined : label}
      aria-expanded={items ? open : undefined}
      data-page-add=""
      className="nx-btn nx-btn-secondary page-add"
      onClick={items ? undefined : onClick}
    >
      <LuPlus size={18} aria-hidden />
    </button>
  );
  if (!items) return button(false);
  return <RichMenu width={300} trigger={button} items={items} />;
}

/** Craft's segmented control ($P/topbar.jsx Seg2), chrome type 13 px. */
export function Seg2<K extends string>({
  value,
  options,
  onChange,
}: {
  value: K;
  options: readonly [K, string][];
  onChange: (v: K) => void;
}) {
  const i = options.findIndex((o) => o[0] === value);
  return (
    <div
      className="shell-seg2-grid"
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      <span
        className="shell-seg2-layer"
        aria-hidden="true"
        style={{
          width: `calc((100% - 6px) / ${options.length})`,
          transform: `translateX(${i * 100}%)`,
        }}
      />
      {options.map(([id, l]) => (
        <button
          key={id}
          type="button"
          className="tb-seg shell-seg2-seg"
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          style={{
            font: `${value === id ? 500 : 400} 13px/18px var(--font-sans)`,
            color:
              value === id ? "var(--text-primary)" : "var(--text-tertiary)",
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
