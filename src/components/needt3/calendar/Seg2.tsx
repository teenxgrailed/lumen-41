"use client";

/**
 * Craft's segmented control ($P/topbar.jsx `Seg2`): a white thumb slides
 * between the options. Same classes as the shell's copy (shell.css); chrome
 * type is 13px here, not the prototype's 14.
 */
export function Seg2({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (v: string) => void;
}) {
  const i = Math.max(
    0,
    options.findIndex((o) => o[0] === value)
  );
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
      {options.map(([id, label]) => (
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
          {label}
        </button>
      ))}
    </div>
  );
}
