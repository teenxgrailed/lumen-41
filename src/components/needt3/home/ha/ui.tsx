import { Fragment, type ReactNode } from "react";

import { Glyph, type GlyphName } from "@/components/needt3/glyphs/Glyph";

/**
 * Small shared bits of the new Home pieces (additions/home/ha-home.jsx): the
 * 16px stroke icons of the chrome, the glyph pack at a size, class joining and
 * the break rule for file-like titles.
 */

const HA_I = {
  x: "M4 4l8 8M12 4l-8 8",
  check: "M3.5 8.5l3 3 6-7",
  plus: "M8 3v10M3 8h10",
  target:
    "M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  star: "M8 2l1.8 3.9 4.2.5-3.1 2.9.8 4.2L8 11.4l-3.7 2.1.8-4.2L2 6.4l4.2-.5z",
  arrow: "M3 8h9M9 4.5L12.5 8 9 11.5",
  chev: "M6 3.5L10.5 8 6 12.5",
  swap: "M3 5.5h9l-2.5-2.5M13 10.5H4l2.5 2.5",
  moon: "M12.5 9.6A5 5 0 0 1 6.4 3.5a5 5 0 1 0 6.1 6.1z",
} as const;

export type HaIconName = keyof typeof HA_I;

export function HaI({ n, s }: { n: HaIconName; s?: number }) {
  const fill = n === "star";
  return (
    <svg
      viewBox="0 0 16 16"
      width={s ?? 16}
      height={s ?? 16}
      fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={HA_I[n]} />
    </svg>
  );
}

/** A glyph of the pack, drawn at `size` (the `.ha-g` box). */
export function HaG({ name, size }: { name: GlyphName; size: number }) {
  return <Glyph name={name} size={size} className="ha-g" />;
}

export const haCx = (...a: (string | false | null | undefined)[]) =>
  a.filter(Boolean).join(" ");

/** File-like titles ("campaign/FOUR_LOOK_LIST.md") may break after / _ . only. */
export function haBreak(title: string): ReactNode {
  const parts = String(title).split(/(?<=[/_.])/);
  return parts.map((p, i) => (
    <Fragment key={i}>
      {p}
      {i < parts.length - 1 ? <wbr /> : null}
    </Fragment>
  ));
}

/** The density wrapper: it only carries the `--ha-*` aliases, it adds no box. */
export function HaScope({
  phone,
  children,
}: {
  phone?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={phone ? "ha-phone" : "ha-desk"}
      style={{ display: "contents" }}
    >
      {children}
    </div>
  );
}
