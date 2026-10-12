"use client";

import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

import strings from "../../../../docs/port/prototype/port/strings/en.json";
import { backdropVars } from "./backdrop";
import {
  type DocStyle,
  type StyledDoc,
  type TokenReader,
  fontOf,
  isPictureCover,
  pageVars,
  styleOf,
} from "./style";

const copy = strings["DocsScreen.jsx"];

const NO_TOKENS: TokenReader = () => "";

/**
 * Reads themes.css tokens off the `.needt-v3` scope element. Empty on the
 * server and the first client render, so a styled page starts on the default
 * look and takes its colours one frame later.
 */
export function useDocTokens(): TokenReader {
  const [read, setRead] = useState<TokenReader>(() => NO_TOKENS);
  useEffect(() => {
    const el = document.querySelector(".needt-v3");
    if (!el) return;
    const css = getComputedStyle(el);
    const memo = new Map<string, string>();
    setRead(() => (name: string) => {
      let v = memo.get(name);
      if (v === undefined) {
        v = css.getPropertyValue(name).trim();
        memo.set(name, v);
      }
      return v;
    });
  }, []);
  return read;
}

/** An uploaded cover picture; anything else draws nothing. */
export function DcCover({
  cover,
  style,
}: {
  cover: string | null;
  style?: CSSProperties;
}) {
  if (!isPictureCover(cover)) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- user-uploaded cover of any origin
    <img
      src={cover!}
      alt=""
      draggable={false}
      className="docs-fill docs-cover-img"
      style={style}
    />
  );
}

/** A swatch split on the diagonal: the Light reading over the Dark one. */
export function DcSplit({
  l,
  d,
  size = 26,
  round = true,
  inner,
}: {
  l: string;
  d: string;
  size?: number;
  round?: boolean;
  inner?: ReactNode;
}) {
  return (
    <span
      className="docs-dc-split-1"
      aria-hidden="true"
      style={
        {
          width: size,
          height: size,
          borderRadius: round ? size : 7,
          "--split-l": l,
          "--split-d": d,
        } as CSSProperties
      }
    >
      {inner}
    </span>
  );
}

/** The backdrop as a surface; none falls back to the app's ground. */
export function DcBackdrop({
  id,
  read,
  className,
  frame,
  style,
  children,
}: {
  id: string;
  read: TokenReader;
  className?: string;
  frame?: boolean;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const none = id === "none";
  return (
    <span
      className={
        "dc-bd docs-bd" +
        (none ? " is-none" + (frame ? " is-frame" : "") : "") +
        (className ? ` ${className}` : "")
      }
      style={none ? style : { ...backdropVars(id, read), ...style }}
    >
      {children}
    </span>
  );
}

/**
 * A page in miniature on its backdrop: the style preview and the gallery
 * tile. Everything inside reads the same vars as the page.
 */
export function DcMiniPage({
  s,
  read,
  title,
  pad = 10,
  radius = 8,
  lines = [86, 70, 78],
}: {
  s: DocStyle;
  read: TokenReader;
  title?: string;
  pad?: number;
  radius?: number;
  lines?: number[];
}) {
  const f = fontOf(s.font);
  return (
    <span
      className="dt-themed docs-mini-page"
      style={{
        height: "100%",
        borderRadius: radius,
        fontFamily: f.css,
        ...pageVars(s, read),
      }}
    >
      {s.cover ? (
        <span className="docs-dc-mini-page-1">
          <DcCover cover={s.cover} />
        </span>
      ) : null}
      <span className="docs-dc-mini-page-2" style={{ padding: pad }}>
        <span
          className="docs-dc-mini-page-3"
          style={{ "--mini-font": f.css } as CSSProperties}
        >
          {title || strings["DocsScreen.jsx"].DcMiniPage.untitled}
        </span>
        {lines.map((w, i) => (
          <span
            className="docs-dc-mini-page-4"
            key={i}
            style={{ width: `${w}%` }}
          />
        ))}
      </span>
    </span>
  );
}

/** A document's face smaller than a card (list rows, the share sheet). */
export function DocThumb({
  doc,
  read,
  w,
  h,
}: {
  doc: StyledDoc & { title: string };
  read: TokenReader;
  w: number;
  h: number;
}) {
  const s = styleOf(doc);
  const bd = s.backdrop !== "none";
  const pad = bd ? Math.max(2, Math.round(w / 9)) : 0;
  const ip = Math.round(w / 8);
  return (
    <span
      aria-hidden="true"
      className={"docs-thumb" + (bd ? " dc-bd" : "")}
      style={{
        width: w,
        height: h,
        borderRadius: Math.round(w / 5),
        padding: bd ? `${pad}px ${pad}px 0` : 0,
        ...(bd ? backdropVars(s.backdrop, read) : null),
      }}
    >
      <span
        className={"dt-themed docs-thumb-page" + (bd ? " is-on" : "")}
        style={{
          borderRadius: bd ? `${ip}px ${ip}px 0 0` : 0,
          ...pageVars(s, read),
        }}
      >
        {s.cover ? (
          <span
            className="docs-doc-thumb-1"
            style={{ height: Math.round(h * 0.22) }}
          >
            <DcCover cover={s.cover} />
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** The design system's switch (ds-tokens.css `.nt-switch`). */
export function V3Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label
      className="nt-switch"
      data-checked={checked ? "true" : "false"}
      data-disabled={disabled ? "true" : undefined}
    >
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="nt-switch-track">
        <span className="nt-switch-knob" />
      </span>
    </label>
  );
}

export { copy as docsCopy };
