/**
 * The six looks of a folder (see `folder-style.ts`), drawn from the same data
 * as the plain `Folder`. Pure CSS (src/styles/v3-overrides/folder-lab.css,
 * prefix `fl`); every badge, pill and mark is a real field of the folder, and
 * what a folder has no data for is left out, never made up:
 *
 *   1 Frosted white   count badge, a status pill (only when `statusLabel`)
 *   2 Coloured glass  the glyph pressed into the front, a count chip
 *   3 Papers peeking  a fan of papers with title and due day
 *   4 Stamp and clip  the glyph (or an app mark) on a stamp, a clip
 *   5 App icons       the connected apps; with none the folder wears look 1
 *   6 Dark frosted    "Updated", and the people when they are known
 */
import { type CSSProperties, type ReactNode } from "react";

import { type FolderStyleId, agoToken } from "@/lib/needt3/folder-style";
import { paletteColor } from "@/lib/needt3/project-color";

import { BrandIcon, type BrandId } from "../brand";

export interface FolderStyledData {
  count?: number | string;
  /** What the count counts ("open", "pages", "to learn"). */
  unit?: string;
  glyph?: ReactNode;
  peeks: readonly {
    key: string;
    title: string;
    meta?: string;
    muted?: boolean;
  }[];
  /** The line under the label when there is no `updatedAt` (Learn). */
  caption?: string;
  /** What needs attention ("3 due today", "Synced"); no pill without it. */
  statusLabel?: string;
  updatedAt?: number | null;
  now: number;
  members?: readonly { id: string; name: string }[];
  apps?: readonly BrandId[];
  kind?: "project" | "docs" | "topic";
}

/** The look a folder really gets: 5 needs apps, else it wears 1. */
export function effectiveStyle(
  style: FolderStyleId,
  apps: readonly BrandId[] | undefined
): FolderStyleId {
  return style === 5 && !(apps && apps.length) ? 1 : style;
}

const DECK = [
  { left: 10, top: 29, w: 74, rot: -1.5, tint: 0 },
  { left: 18, top: 15, w: 70, rot: 2, tint: 9 },
  { left: 11, top: 1, w: 66, rot: -3, tint: 15 },
] as const;

const FAN: readonly (readonly { left: number; top: number; rot: number }[])[] =
  [
    [],
    [{ left: 28, top: 2, rot: 0 }],
    [
      { left: 10, top: 6, rot: -5 },
      { left: 46, top: 4, rot: 5 },
    ],
    [
      { left: 1, top: 8, rot: -6 },
      { left: 28, top: 0, rot: 0 },
      { left: 55, top: 8, rot: 6 },
    ],
  ];

const TILES = [
  { left: 7, top: 12, rot: -7 },
  { left: 31, top: 3, rot: 3 },
  { left: 55, top: 13, rot: 8 },
] as const;

const Mark = ({ doc }: { doc: boolean }) => (
  <span className={`fl-mark${doc ? " is-doc" : ""}`} />
);

function Sheets({ d, max = 3 }: { d: FolderStyledData; max?: number }) {
  const sheets = d.peeks.slice(0, max);
  return (
    <>
      {sheets.map((s, i) => (
        <span
          key={s.key}
          className="fl-sheet"
          data-folder-peek=""
          data-title={s.title}
          style={
            {
              "--l": `${DECK[i].left}%`,
              "--t": `${DECK[i].top}%`,
              "--w": `${DECK[i].w}%`,
              "--r": `${DECK[i].rot}deg`,
              "--tint": `${DECK[i].tint}%`,
              zIndex: sheets.length - i,
            } as CSSProperties
          }
        >
          <Mark doc={d.kind === "docs"} />
          <span className={`fl-sheet-title${s.muted ? " is-muted" : ""}`}>
            {s.title}
          </span>
        </span>
      ))}
    </>
  );
}

function Glyph({ node, size }: { node: ReactNode; size: number }) {
  if (!node) return null;
  return (
    <span
      className="fl-glyph"
      style={{ "--g": `${size}px` } as CSSProperties}
      data-folder-glyph=""
    >
      {node}
    </span>
  );
}

/** A postage stamp outline: a rectangle with half-circle bites along the edges. */
function stampPath(w: number, h: number, step: number): string {
  const r = step / 2;
  const nx = Math.round(w / step);
  const ny = Math.round(h / step);
  const sx = w / nx;
  const sy = h / ny;
  const rx = sx / 2;
  const ry = sy / 2;
  let d = "M0 0";
  for (let i = 0; i < nx; i++) d += ` a${rx} ${r} 0 0 0 ${sx} 0`;
  for (let i = 0; i < ny; i++) d += ` a${r} ${ry} 0 0 0 0 ${sy}`;
  for (let i = 0; i < nx; i++) d += ` a${rx} ${r} 0 0 0 ${-sx} 0`;
  for (let i = 0; i < ny; i++) d += ` a${r} ${ry} 0 0 0 0 ${-sy}`;
  return d + "Z";
}
const STAMP_W = 54;
const STAMP_H = 64;
const STAMP_D = stampPath(STAMP_W, STAMP_H, 6);

function PaperClip() {
  return (
    <svg
      className="fl-clip"
      viewBox="0 0 18 46"
      width="18"
      height="46"
      aria-hidden="true"
    >
      <path
        d="M5.5 33V10a3.5 3.5 0 0 1 7 0v24a6.5 6.5 0 0 1-13 0V13"
        transform="translate(2.5 0)"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Avatar({ p, z }: { p: { id: string; name: string }; z: number }) {
  const letter = Array.from(p.name.trim())[0] ?? "?";
  return (
    <span
      className="fl-avatar"
      title={p.name}
      style={{ background: paletteColor(p.id), zIndex: z }}
    >
      {letter}
    </span>
  );
}

const Count = ({
  d,
  cls,
}: {
  d: FolderStyledData;
  cls: "fl-badge" | "fl-count-chip" | "fl-front-count";
}) =>
  d.count === undefined ? null : (
    <span className={cls} data-fl-count="" data-folder-count="">
      {d.count}
    </span>
  );

/** The line under the label, from real fields only. */
export function folderMeta(style: FolderStyleId, d: FolderStyledData): string {
  const updated = agoToken(d.updatedAt, d.now);
  const count =
    d.count === undefined ? "" : `${d.count}${d.unit ? ` ${d.unit}` : ""}`;
  if (style === 5) {
    const n = d.apps?.length ?? 0;
    return [`${n} ${n === 1 ? "app" : "apps"}`, updated && `Updated ${updated}`]
      .filter(Boolean)
      .join(" · ");
  }
  if (style === 6 && d.members && d.members.length > 1)
    return [count, `${d.members.length} people`].filter(Boolean).join(" · ");
  return [count, updated ? `Updated ${updated}` : d.caption]
    .filter(Boolean)
    .join(" · ");
}

/** What goes inside `.fl-art` (papers before the front wall, furniture after). */
export function FolderArt({
  style,
  d,
}: {
  style: FolderStyleId;
  d: FolderStyledData;
}) {
  const grain = (
    <span className="fl-front">
      <span className="fl-grain" />
    </span>
  );
  const updated = agoToken(d.updatedAt, d.now);
  switch (style) {
    case 1:
      return (
        <>
          <Sheets d={d} />
          {grain}
          <Count d={d} cls="fl-badge" />
          {d.statusLabel ? (
            <span className="fl-pill" data-fl-status="">
              <span className="fl-dot" />
              {d.statusLabel}
            </span>
          ) : null}
        </>
      );
    case 2:
      return (
        <>
          <Sheets d={d} />
          {grain}
          {d.glyph ? (
            <span className="fl-emboss">
              <Glyph node={d.glyph} size={46} />
            </span>
          ) : null}
          <Count d={d} cls="fl-count-chip" />
        </>
      );
    case 3: {
      const sheets = d.peeks.slice(0, 3);
      const fan = FAN[sheets.length];
      return (
        <>
          {sheets.map((s, i) => (
            <span
              key={s.key}
              className="fl-paper"
              data-folder-peek=""
              data-title={s.title}
              style={
                {
                  "--l": `${fan[i].left}%`,
                  "--t": `${fan[i].top}%`,
                  "--w": "44%",
                  "--r": `${fan[i].rot}deg`,
                  "--tint": `${i * 8}%`,
                  zIndex: sheets.length === 3 && i === 1 ? 3 : 2,
                } as CSSProperties
              }
            >
              <Mark doc={d.kind === "docs"} />
              <span className={`fl-paper-title${s.muted ? " is-muted" : ""}`}>
                {s.title}
              </span>
              {s.meta ? <span className="fl-paper-due">{s.meta}</span> : null}
              <span className="fl-line" />
              <span className="fl-line is-short" />
            </span>
          ))}
          {grain}
          <Count d={d} cls="fl-front-count" />
        </>
      );
    }
    case 4: {
      const brand = d.apps?.[0];
      const face = d.glyph ? (
        <Glyph node={d.glyph} size={30} />
      ) : brand ? (
        <BrandIcon id={brand} size={34} />
      ) : null;
      return (
        <>
          <Sheets d={d} max={2} />
          {grain}
          <span className="fl-clip-wrap">
            <PaperClip />
          </span>
          {face ? (
            <span className="fl-stamp" data-fl-stamp="">
              <svg
                className="fl-stamp-shape"
                viewBox={`0 0 ${STAMP_W} ${STAMP_H}`}
                aria-hidden="true"
              >
                <path d={STAMP_D} />
              </svg>
              <span className="fl-stamp-face">{face}</span>
            </span>
          ) : null}
          <Count d={d} cls="fl-front-count" />
        </>
      );
    }
    case 5: {
      const apps = d.apps ?? [];
      const shown = apps.slice(0, 3);
      const more = apps.length - shown.length;
      return (
        <>
          {shown.map((id, i) => (
            <span
              key={id}
              className="fl-tile"
              data-fl-app={id}
              style={
                {
                  "--l": `${TILES[i].left}%`,
                  "--t": `${TILES[i].top}%`,
                  "--r": `${TILES[i].rot}deg`,
                  zIndex: 1 + (i === 1 ? 2 : 1),
                } as CSSProperties
              }
            >
              <BrandIcon id={id} size={44} />
            </span>
          ))}
          {more > 0 ? (
            <span className="fl-more" style={{ zIndex: 2 }}>
              +{more}
            </span>
          ) : null}
          {grain}
          <span className="fl-badge" data-fl-count="" data-folder-count="">
            {apps.length}
          </span>
          {d.statusLabel ? (
            <span className="fl-pill" data-fl-status="">
              <span className="fl-dot" />
              {d.statusLabel}
            </span>
          ) : null}
        </>
      );
    }
    default: {
      const people = (d.members ?? []).slice(0, 4);
      const more = (d.members?.length ?? 0) - people.length;
      return (
        <>
          <Sheets d={d} />
          {grain}
          {updated ? (
            <span className="fl-updated" data-fl-status="">
              Updated {updated}
            </span>
          ) : null}
          {people.length ? (
            <span className="fl-stack" data-fl-members="">
              {people.map((p, i) => (
                <Avatar key={p.id} p={p} z={people.length - i} />
              ))}
              {more > 0 ? (
                <span className="fl-avatar is-more">+{more}</span>
              ) : null}
            </span>
          ) : (
            <Count d={d} cls="fl-count-chip" />
          )}
        </>
      );
    }
  }
}
