"use client";

import { type KeyboardEvent, useRef } from "react";

/**
 * The one segmented control (Craft's `Seg2`): a grey track, a raised thumb
 * under the selected option that slides between options, the selected label in
 * full ink, the others one step down, counts one step further down. Home's
 * Day | Week ahead, Tasks' Inbox | Today | Upcoming | All Tasks and the
 * Calendar's Week | Agenda all render through here. Styles: `.shell-seg2-*` in
 * shell.css. Arrow keys move the selection (and the focus with it).
 */
export type SegmentedOption<K extends string> = {
  id: K;
  label: string;
  /** A tally after the label; hidden when 0 or missing. */
  count?: number | null;
  /** Extra attributes for the button (a test or e2e hook such as data-hd-tab). */
  attrs?: Record<`data-${string}`, string>;
};

export function Segmented<K extends string>({
  value,
  options,
  onChange,
  className,
  label,
}: {
  value: K;
  options: readonly SegmentedOption<K>[];
  onChange: (v: K) => void;
  className?: string;
  /** Accessible name of the group. */
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const n = options.length;
  const i = Math.max(
    0,
    options.findIndex((o) => o.id === value)
  );
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (i - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].id);
    ref.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  };
  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={label}
      className={`shell-seg2-grid${className ? ` ${className}` : ""}`}
      style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
      onKeyDown={onKey}
    >
      <span
        className="shell-seg2-layer"
        aria-hidden="true"
        data-seg-thumb={i}
        style={{
          width: `calc((100% - 6px) / ${n})`,
          transform: `translateX(${i * 100}%)`,
        }}
      />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          className="tb-seg shell-seg2-seg"
          aria-selected={value === o.id}
          tabIndex={value === o.id ? 0 : -1}
          onClick={() => onChange(o.id)}
          {...o.attrs}
        >
          {o.label}
          {o.count ? <span className="shell-seg2-count">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** [id, label] pairs, for the call sites that never carry counts. */
export function Seg2<K extends string>({
  value,
  options,
  onChange,
}: {
  value: K;
  options: readonly (readonly [K, string])[];
  onChange: (v: K) => void;
}) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={options.map(([id, label]) => ({ id, label }))}
    />
  );
}
