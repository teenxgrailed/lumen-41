"use client";

import type { CSSProperties } from "react";

import { LuImage } from "react-icons/lu";

import type { V3BoardPreview } from "@/lib/needt3/map";

const HEX = /^#[0-9a-f]{3,8}$/i;

/** What one tile is painted with (places.jsx `Collage`); a plain fill when it has no picture. */
export function tileFill(x: V3BoardPreview): string {
  const picture = x.kind === "image" ? x.url : x.thumbnailUrl;
  if (picture)
    return `center / cover no-repeat url(${JSON.stringify(picture)})`;
  if (x.kind === "color" && x.color && HEX.test(x.color)) return x.color;
  return "var(--fill-2)";
}

/**
 * A board's cover: its first references as a collage, the first one tall
 * (places.jsx `Collage`). Only an empty board shows the grey picture glyph.
 */
export function PlCollage({
  items,
  height,
}: {
  items: readonly V3BoardPreview[];
  height: number;
}) {
  const tiles = items.slice(0, 3);
  return (
    <div
      className="pl-collage-grid"
      data-pl-collage={tiles.length}
      style={{ height }}
      aria-hidden="true"
    >
      {tiles.map((x, i) => (
        <span
          key={x.id}
          className={`pl-collage-el${i === 0 && tiles.length > 1 ? " is-tall" : ""}${tiles.length === 1 ? " is-wide" : ""}`}
          style={{ "--pl-bg": tileFill(x) } as CSSProperties}
        >
          {x.kind === "note" ? (
            <span className="pl-collage-abs">{x.text}</span>
          ) : null}
        </span>
      ))}
      {!tiles.length ? (
        <span className="pl-collage-grid-2">
          <LuImage size={22} />
        </span>
      ) : null}
    </div>
  );
}
