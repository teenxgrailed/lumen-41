"use client";

import { type ReactNode, useEffect, useState } from "react";

import { hhmm } from "@/lib/onboarding/format";

/* Small parts the onboarding screens share. Prefix ob3-, ported 1:1 from the
   design's ob3-flow.jsx. */

export const cx3 = (...a: Array<string | false | null | undefined>) =>
  a.filter(Boolean).join(" ");

export function Check3({ s = 12 }: { s?: number }) {
  return (
    <svg
      className="ob3-ck"
      viewBox="0 0 16 16"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

export const Spin3 = () => <span className="ob3-spin" aria-hidden="true" />;

export const Mark3 = ({ size = 28 }: { size?: number }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    className="ob3-mark"
    src="/brand/needt-icon-midnight.svg"
    width={size}
    height={size}
    alt=""
  />
);

/** Headline: words rise one after another; the starred word is the italic one. */
export function Head({ text }: { text: string }) {
  const parts = text.split(" ");
  return (
    <h1 className="ob3-h">
      {parts.map((w, i) => (
        <span key={i} className="ob3-w" style={{ "--i": i } as never}>
          {w.includes("*") ? <em>{w.replace(/\*/g, "")}</em> : w}
          {i < parts.length - 1 ? " " : ""}
        </span>
      ))}
    </h1>
  );
}

export function Typed({ text, speed = 14 }: { text: string; speed?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return (
    <>
      {text.slice(0, n)}
      {n < text.length ? <span className="ob3-caret" /> : null}
    </>
  );
}

export function Count({
  to,
  fmt,
  ms = 1000,
}: {
  to: number;
  fmt?: (v: number) => string;
  ms?: number;
}) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    let t0 = 0;
    const f = (t: number) => {
      t0 = t0 || t;
      const p = Math.min(1, (t - t0) / ms);
      setV(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <>{fmt ? fmt(v) : Math.round(v)}</>;
}

/** A number that bumps when it changes. */
export function Bump({
  children,
  k,
}: {
  children: ReactNode;
  k: string | number;
}) {
  return (
    <span key={k} className="ob3-bump">
      {children}
    </span>
  );
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  label: string;
}) {
  return (
    <span className="ob3-stepper" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 0.5))}
        disabled={value <= min}
        aria-label={label + " earlier"}
      >
        −
      </button>
      <b key={value} className="ob3-flip">
        {hhmm(value)}
      </b>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 0.5))}
        disabled={value >= max}
        aria-label={label + " later"}
      >
        +
      </button>
    </span>
  );
}

export function Seg<T extends string | number>({
  value,
  onChange,
  options,
  small,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<readonly [T, string, string?]>;
  small?: boolean;
}) {
  const i = Math.max(
    0,
    options.findIndex((o) => o[0] === value)
  );
  return (
    <div
      className={cx3("ob3-seg", small && "sm")}
      style={{ "--n": options.length, "--x": i } as never}
      role="radiogroup"
    >
      <i className="ob3-seg-pill" aria-hidden="true" />
      {options.map(([v, t, s]) => (
        <button
          type="button"
          role="radio"
          aria-checked={v === value}
          key={String(v)}
          className={v === value ? "is-on" : ""}
          onClick={() => onChange(v)}
        >
          <b>{t}</b>
          {s ? <small>{s}</small> : null}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  on,
  onChange,
  label,
  sub,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sub?: string;
}) {
  return (
    <button
      type="button"
      className={cx3("ob3-toggle", on && "is-on")}
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
    >
      <span>
        <b>{label}</b>
        {sub ? <small>{sub}</small> : null}
      </span>
      <i />
    </button>
  );
}
