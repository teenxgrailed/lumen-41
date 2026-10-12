"use client";

import {
  type CSSProperties,
  type ReactNode,
  createContext,
  useContext,
  useRef,
} from "react";

import {
  LuArrowUpRight,
  LuCheck,
  LuChevronRight,
  LuChevronsUpDown,
  LuLock,
} from "react-icons/lu";

import { PkSheet, pkCx } from "../kit";

/* The small pieces every Settings page shares (phone-settings.jsx Ps*). The
   look is the vendored styles/phone-settings.css (`ps-*`): a group is a glass
   card of rows, a row is [glyph] title + line · value / control · chevron. A
   row that opens something is one button; a control sits beside the text,
   never inside a button. */

/** One list a picker sheet shows: the words, an optional line, a check on the value. */
export interface PsPickSpec {
  title: string;
  value: string;
  options: readonly (readonly [string, string, string?])[];
  onChange: (value: string) => void;
}

interface PsCtx {
  /** Open the picker sheet for a setting with a list of values. */
  pick: (spec: PsPickSpec) => void;
  /** Open the paywall on a feature ("Accent colours"), or on its own. */
  upgrade: (feature?: string) => void;
  /** Close Settings and go to a route (Connections). */
  leave: (href: string) => void;
}

const Ctx = createContext<PsCtx>({
  pick: () => undefined,
  upgrade: () => undefined,
  leave: () => undefined,
});
export const PsProvider = Ctx.Provider;
export const usePs = () => useContext(Ctx);

/* ---------- the coloured tile ---------- */

const GLYPH_PX = { s: 32, m: 44 } as const;

/** A setting's icon on a tile washed with its hue (the kit's `.pk-glyph` look). */
export function PsGlyph({
  icon,
  hue,
  size,
}: {
  icon: ReactNode;
  hue?: string;
  size?: keyof typeof GLYPH_PX;
}) {
  const px = GLYPH_PX[size ?? "s"];
  return (
    <span
      className="pk-glyph is-tint ps-glyph"
      aria-hidden="true"
      style={
        {
          "--pk-gl": `${px}px`,
          "--pk-gl-hue": hue ?? "var(--v2p-lav)",
        } as CSSProperties
      }
    >
      <span className="ps-glyph-ico">{icon}</span>
    </span>
  );
}

/* ---------- controls ---------- */

export function PsSwitch({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={pkCx("ps-switch", on && "is-on")}
      onClick={() => onChange(!on)}
    >
      <span className="ps-switch-knob" />
    </button>
  );
}

export function PsSeg({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <span className="ps-seg" role="radiogroup" aria-label={label}>
      {options.map(([id, word]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          disabled={disabled}
          className={pkCx("ps-seg-btn", value === id && "is-on")}
          onClick={() => onChange(id)}
          data-ps-seg={id}
        >
          {word}
        </button>
      ))}
    </span>
  );
}

export function PsProTag({ locked }: { locked?: boolean }) {
  return (
    <span className={pkCx("ps-pro", locked && "is-locked")}>
      {locked ? <LuLock size={10} aria-hidden /> : null}Pro
    </span>
  );
}

/* ---------- group and row ---------- */

/** A group: an optional label, a glass card of rows, an optional hint. */
export function PsGroup({
  title,
  hint,
  children,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="ps-group">
      {title ? <span className="pk-label ps-group-label">{title}</span> : null}
      <div className="ps-card">{children}</div>
      {hint ? <p className="ps-hint">{hint}</p> : null}
    </section>
  );
}

export function PsRow({
  glyph,
  title,
  desc,
  value,
  control,
  onOpen,
  chevron,
  tone,
  out,
  disabled,
  expanded,
  data,
}: {
  glyph?: ReactNode;
  title: ReactNode;
  desc?: ReactNode;
  value?: ReactNode;
  control?: ReactNode;
  /** Makes the whole row one button. */
  onOpen?: () => void;
  /** `false` hides it; `"pick"` draws the up-down mark of a list of values. */
  chevron?: boolean | "pick";
  tone?: "danger" | "link";
  /** The row leaves Settings: an arrow instead of a chevron. */
  out?: boolean;
  /** Off until the value's source has loaded, so nothing writes blind. */
  disabled?: boolean;
  expanded?: boolean;
  data?: Record<string, string>;
}) {
  const text = (
    <span className="ps-row-text">
      <span className="ps-row-title">{title}</span>
      {desc ? <span className="ps-row-desc">{desc}</span> : null}
    </span>
  );
  const open = !!onOpen && !disabled;
  const tail = (
    <>
      {value != null && value !== false ? (
        <span className="ps-row-value">{value}</span>
      ) : null}
      {onOpen && chevron !== false ? (
        <span className="ps-row-chev" aria-hidden="true">
          {out ? (
            <LuArrowUpRight size={16} />
          ) : chevron === "pick" ? (
            <LuChevronsUpDown size={14} />
          ) : (
            <LuChevronRight size={16} />
          )}
        </span>
      ) : null}
    </>
  );
  const cls = pkCx(
    "ps-row",
    open && "is-open",
    tone && `is-${tone}`,
    disabled && "is-off"
  );
  if (open) {
    return (
      <button
        type="button"
        className={cls}
        onClick={onOpen}
        aria-expanded={expanded}
        {...(data ?? {})}
      >
        {glyph ?? null}
        {text}
        {tail}
      </button>
    );
  }
  return (
    <div
      className={cls}
      aria-disabled={disabled || undefined}
      {...(data ?? {})}
    >
      {glyph ?? null}
      {text}
      {tail}
      {control ? <span className="ps-row-ctl">{control}</span> : null}
    </div>
  );
}

/**
 * A setting with a list of values: the row shows the chosen one; a tap opens
 * the picker sheet (the product's picker; no native control). `disabled`
 * keeps it shut until the value's source has loaded.
 */
export function PsPick({
  title,
  desc,
  value,
  options,
  onChange,
  disabled,
  glyph,
  data,
}: {
  title: string;
  desc?: ReactNode;
  value: string;
  options: PsPickSpec["options"];
  onChange: (value: string) => void;
  disabled?: boolean;
  glyph?: ReactNode;
  data?: Record<string, string>;
}) {
  const { pick } = usePs();
  const cur = options.find((o) => o[0] === value);
  return (
    <PsRow
      glyph={glyph}
      title={title}
      desc={desc}
      value={cur ? cur[1] : value}
      chevron="pick"
      disabled={disabled}
      data={data}
      onOpen={() => pick({ title, value, options, onChange })}
    />
  );
}

/**
 * The picker sheet: a row per option, a check on the chosen one. It is a
 * sibling of the Settings sheet (its layer fills the frame), and keeps what it
 * showed while it slides away.
 */
export function PsPicker({
  spec,
  onClose,
}: {
  spec: PsPickSpec | null;
  onClose: () => void;
}) {
  const last = useRef<PsPickSpec | null>(null);
  if (spec) last.current = spec;
  const p = spec ?? last.current;
  return (
    <PkSheet
      open={!!spec}
      onClose={onClose}
      title={p ? p.title : ""}
      label={p ? p.title : "Choose"}
      className="ps-pick-sheet"
    >
      {p ? (
        <div
          className="ps-card ps-pick-list"
          role="listbox"
          aria-label={p.title}
          data-ps-picker={p.title}
        >
          {p.options.map(([id, word, sub]) => (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={p.value === id}
              className={pkCx(
                "ps-row",
                "is-open",
                "ps-pick-row",
                p.value === id && "is-on"
              )}
              onClick={() => {
                p.onChange(id);
                onClose();
              }}
              data-ps-option={id}
            >
              <span className="ps-row-text">
                <span className="ps-row-title">{word}</span>
                {sub ? <span className="ps-row-desc">{sub}</span> : null}
              </span>
              <span className="ps-pick-check" aria-hidden="true">
                {p.value === id ? <LuCheck size={18} /> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </PkSheet>
  );
}
