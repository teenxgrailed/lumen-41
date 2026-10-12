"use client";

import {
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type PropsWithChildren,
} from "react";

export interface GlassCardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onClick" | "style"> {
  pad?: number;
  radius?: number;
  width?: number | string;
  /** A small line under the content (11.5px, tertiary). */
  caption?: string;
  strong?: boolean;
  /** The picked plan card: an ink ring instead of the hairline. */
  best?: boolean;
  onClick?: (
    e: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>
  ) => void;
  /** Accessible name when the card is clickable. */
  label?: string;
  style?: CSSProperties;
}

/** Frosted glass, measured from Craft's paywall plan card. */
export function GlassCard({
  pad,
  radius,
  width,
  caption,
  strong,
  best,
  className,
  style,
  onClick,
  label,
  children,
  ...rest
}: PropsWithChildren<GlassCardProps>) {
  const clickable = !!onClick;
  return (
    <div
      {...rest}
      className={
        "px-glass" +
        (strong ? " is-strong" : "") +
        (best ? " is-best" : "") +
        (clickable ? " is-click" : "") +
        (className ? " " + className : "")
      }
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? label : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.(e);
              }
            }
          : undefined
      }
      style={{
        width,
        padding: pad == null ? 20 : pad,
        borderRadius: radius == null ? 26 : radius,
        ...style,
      }}
    >
      {children}
      {caption ? <span className="px-caption">{caption}</span> : null}
    </div>
  );
}

/** The black "PRO" pill and its glass / green relatives. */
export function PxBadge({
  tone,
  className,
  style,
  children,
}: PropsWithChildren<{
  tone?: "solid" | "glass" | "green";
  className?: string;
  style?: CSSProperties;
}>) {
  return (
    <span
      className={
        "px-badge" +
        (tone === "glass" ? " is-glass" : tone === "green" ? " is-green" : "") +
        (className ? " " + className : "")
      }
      style={style}
    >
      {children}
    </span>
  );
}

/** Pill progress: the current step is a long pill, the rest small dots. */
export function PxDots({
  count,
  index,
  onPick,
  label,
  names,
  className,
  style,
}: {
  count: number;
  index: number;
  onPick?: (n: number) => void;
  label?: string;
  names?: readonly string[];
  className?: string;
  style?: CSSProperties;
}) {
  const items = [];
  for (let n = 0; n < count; n++) {
    const cls =
      "px-dot" + (n === index ? " is-on" : n < index ? " is-done" : "");
    items.push(
      onPick ? (
        <button
          key={n}
          type="button"
          className={cls}
          data-px-dot={n}
          aria-label={`Step ${n + 1}${names?.[n] ? ": " + names[n] : ""}`}
          aria-current={n === index ? "step" : undefined}
          onClick={() => onPick(n)}
        />
      ) : (
        <span key={n} className={cls} />
      )
    );
  }
  return (
    <div
      role="progressbar"
      aria-label={label || "Progress"}
      aria-valuemin={1}
      aria-valuemax={count}
      aria-valuenow={index + 1}
      className={"px-dots" + (className ? " " + className : "")}
      style={style}
    >
      {items}
    </div>
  );
}
