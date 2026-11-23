"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";

import { type Tone, cx } from "./state";

export type SurfaceVariant = "raised" | "well" | "glass";
export type SurfaceSize = "md" | "lg";
export type SurfacePad = "none" | "md" | "lg";

export interface SurfaceProps
  extends Omit<ComponentPropsWithRef<"div">, "children"> {
  /** raised: the white object. well: recessed. glass: floats over the screen. */
  variant?: SurfaceVariant;
  /** md is radius 16 (a card), lg 22 (a plate). */
  size?: SurfaceSize;
  /** Inner padding: none, 16 or 20. */
  pad?: SurfacePad;
  as?: "div" | "section" | "article" | "aside" | "ul" | "ol" | "li";
  children?: ReactNode;
}

/**
 * The one card, plate and tile. Raised and glass are lifted; a lifted Surface
 * inside another lifted Surface (or inside a Sheet) renders flat, a hairline
 * and nothing else: one raised level per stack, so a card is never on a card.
 * The rule is in components.css (`[data-ds-lift] [data-ds-lift]`).
 */
export function Surface({
  variant = "raised",
  size = "md",
  pad = "none",
  as: Tag = "div",
  className,
  children,
  ...rest
}: SurfaceProps) {
  const Element = Tag as "div";
  return (
    <Element
      {...rest}
      className={cx("ds-surface", className)}
      data-variant={variant}
      data-size={size}
      data-pad={pad === "none" ? undefined : pad}
      data-ds-lift={variant === "well" ? undefined : ""}
    >
      {children}
    </Element>
  );
}

export interface TileProps {
  /** sm is 28 (radius 8), md is 40 (radius 12). */
  size?: "sm" | "md";
  /** A hue wash at 12 %; without it, the grey wash. */
  tone?: Tone;
  className?: string;
  children?: ReactNode;
}

/** The leading glyph tile of a Row (pk-glyph, ptk-tile, pd-tile, ppl-tile, PkHueTile). */
export function Tile({ size = "md", tone, className, children }: TileProps) {
  return (
    <span
      className={cx("ds-tile", className)}
      data-size={size}
      data-tone={tone}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}
