"use client";

import { type CSSProperties, type ReactNode } from "react";

import { paletteColor } from "@/lib/needt3/project-color";

import { BrandIcon } from "../brand";
import {
  LAB_ITEMS,
  type LabItem,
  ago,
  countOf,
  sheetsOf,
  statusOf,
  unitOf,
} from "./fixtures";

/**
 * Folders lab (admin only): six candidate looks for the project and doc
 * folder, each with the same four folders. Nothing here is wired into the
 * product; the live `Folder` is untouched until the owner picks one.
 *
 * Shared anatomy (folder-lab.css, prefix `fl`): a glow in the object's own
 * colour under it, a back wall with a tab, sheets, a front wall, then the
 * label and a meta line under it. Hover and press lift the sheets and raise
 * a quiet card behind the whole object, as in the grid reference.
 */

interface ShellProps {
  v: string;
  item: LabItem;
  /** Sheets, tiles or a clip: anything that sits between the walls. */
  papers?: ReactNode;
  /** Badges, pills and glyphs on the front wall. */
  front?: ReactNode;
  /** The line under the label. */
  meta: string;
}

function Shell({ v, item, papers, front, meta }: ShellProps) {
  const style = { "--fl-hue": item.hue } as CSSProperties;
  return (
    <button
      type="button"
      className={`fl fl-${v}`}
      style={style}
      aria-label={`Open ${item.name}, ${countOf(item)} ${unitOf(item)}`}
      data-fl-item={item.id}
    >
      <span className="fl-card" aria-hidden="true" />
      <span className="fl-art" aria-hidden="true">
        <span className="fl-glow" />
        <span className="fl-back" />
        {papers}
        <span className="fl-front">
          <span className="fl-grain" />
        </span>
        {front}
      </span>
      <span className="fl-foot">
        <span className="fl-title" title={item.name}>
          {item.name}
        </span>
        <span className="fl-meta">{meta}</span>
      </span>
    </button>
  );
}

/** Where each sheet sits as a deck: first is lowest, each next a row higher. */
const DECK = [
  { left: 10, top: 29, w: 74, rot: -1.5, tint: 0 },
  { left: 18, top: 15, w: 70, rot: 2, tint: 9 },
  { left: 11, top: 1, w: 66, rot: -3, tint: 15 },
] as const;

function Sheets({ item, mark }: { item: LabItem; mark?: boolean }) {
  const sheets = sheetsOf(item);
  return (
    <>
      {sheets.map((s, i) => (
        <span
          key={s.key}
          className="fl-sheet"
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
          {mark === false ? null : (
            <span
              className={`fl-mark${item.kind === "docs" ? " is-doc" : ""}`}
            />
          )}
          <span className="fl-sheet-title">{s.title}</span>
        </span>
      ))}
    </>
  );
}

function Avatar({ p, z }: { p: LabItem["members"][number]; z: number }) {
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

/* ---------------------------------------------------------------- V1 */

function V1({ item }: { item: LabItem }) {
  return (
    <Shell
      v="v1"
      item={item}
      meta={`${countOf(item)} ${unitOf(item)} · Updated ${ago(item.updatedAt)}`}
      papers={<Sheets item={item} />}
      front={
        <>
          <span className="fl-badge" data-fl-count="">
            {countOf(item)}
          </span>
          <span className="fl-pill" data-fl-status="">
            <span className="fl-dot" />
            {statusOf(item)}
          </span>
        </>
      }
    />
  );
}

/* ---------------------------------------------------------------- V2 */

function V2({ item }: { item: LabItem }) {
  const Glyph = item.glyph;
  return (
    <Shell
      v="v2"
      item={item}
      meta={`${countOf(item)} ${unitOf(item)} · Updated ${ago(item.updatedAt)}`}
      papers={<Sheets item={item} />}
      front={
        <>
          <span className="fl-emboss">
            <Glyph size={46} strokeWidth={2.2} aria-hidden />
          </span>
          <span className="fl-count-chip" data-fl-count="">
            {countOf(item)}
          </span>
        </>
      }
    />
  );
}

/* ---------------------------------------------------------------- V3 */

const FAN = [
  { left: 1, top: 8, w: 44, rot: -6 },
  { left: 28, top: 0, w: 44, rot: 0 },
  { left: 55, top: 8, w: 44, rot: 6 },
] as const;

function V3({ item }: { item: LabItem }) {
  const sheets = sheetsOf(item);
  return (
    <Shell
      v="v3"
      item={item}
      meta={`${countOf(item)} ${unitOf(item)} · Updated ${ago(item.updatedAt)}`}
      papers={sheets.map((s, i) => (
        <span
          key={s.key}
          className="fl-paper"
          style={
            {
              "--l": `${FAN[i].left}%`,
              "--t": `${FAN[i].top}%`,
              "--w": `${FAN[i].w}%`,
              "--r": `${FAN[i].rot}deg`,
              "--tint": `${i * 8}%`,
              zIndex: i === 1 ? 3 : 2,
            } as CSSProperties
          }
        >
          <span className={`fl-mark${item.kind === "docs" ? " is-doc" : ""}`} />
          <span className="fl-paper-title">{s.title}</span>
          {s.due ? <span className="fl-paper-due">{s.due}</span> : null}
          <span className="fl-line" />
          <span className="fl-line is-short" />
        </span>
      ))}
      front={
        <span className="fl-front-count" data-fl-count="">
          {countOf(item)}
        </span>
      }
    />
  );
}

/* ---------------------------------------------------------------- V4 */

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

function V4({ item }: { item: LabItem }) {
  const sheets = sheetsOf(item).slice(0, 2);
  const brand = item.apps[0];
  return (
    <Shell
      v="v4"
      item={item}
      meta={`${countOf(item)} ${unitOf(item)} · Updated ${ago(item.updatedAt)}`}
      papers={sheets.map((s, i) => (
        <span
          key={s.key}
          className="fl-sheet"
          style={
            {
              "--l": i === 0 ? "9%" : "16%",
              "--t": i === 0 ? "26%" : "11%",
              "--w": i === 0 ? "76%" : "68%",
              "--r": i === 0 ? "-1.5deg" : "2.5deg",
              "--tint": i === 0 ? "0%" : "10%",
              zIndex: 2 - i,
            } as CSSProperties
          }
        >
          <span className={`fl-mark${item.kind === "docs" ? " is-doc" : ""}`} />
          <span className="fl-sheet-title">{s.title}</span>
        </span>
      ))}
      front={
        <>
          <span className="fl-clip-wrap">
            <PaperClip />
          </span>
          <span className="fl-stamp" data-fl-stamp="">
            <svg
              className="fl-stamp-shape"
              viewBox={`0 0 ${STAMP_W} ${STAMP_H}`}
              aria-hidden="true"
            >
              <path d={STAMP_D} />
            </svg>
            <span className="fl-stamp-face">
              {item.emoji ? (
                <span className="fl-stamp-emoji">{item.emoji}</span>
              ) : (
                <BrandIcon id={brand} size={34} />
              )}
            </span>
          </span>
          <span className="fl-front-count" data-fl-count="">
            {countOf(item)}
          </span>
        </>
      }
    />
  );
}

/* ---------------------------------------------------------------- V5 */

const TILES = [
  { left: 7, top: 12, rot: -7 },
  { left: 31, top: 3, rot: 3 },
  { left: 55, top: 13, rot: 8 },
] as const;

function V5({ item }: { item: LabItem }) {
  const shown = item.apps.slice(0, 3);
  const more = item.apps.length - shown.length;
  return (
    <Shell
      v="v5"
      item={item}
      meta={`${item.apps.length} ${item.apps.length === 1 ? "app" : "apps"} · Updated ${ago(item.updatedAt)}`}
      papers={
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
        </>
      }
      front={
        <>
          <span className="fl-badge" data-fl-count="">
            {item.apps.length}
          </span>
          <span className="fl-pill" data-fl-status="">
            <span className="fl-dot" />
            {item.apps.length ? "Synced" : "Not connected"}
          </span>
        </>
      }
    />
  );
}

/* ---------------------------------------------------------------- V6 */

function V6({ item }: { item: LabItem }) {
  const people = item.members.slice(0, 4);
  const more = item.members.length - people.length;
  return (
    <Shell
      v="v6"
      item={item}
      meta={`${countOf(item)} ${unitOf(item)} · ${
        item.members.length > 1 ? `${item.members.length} people` : "Just you"
      }`}
      papers={<Sheets item={item} />}
      front={
        <>
          <span className="fl-updated" data-fl-status="">
            Updated {ago(item.updatedAt)}
          </span>
          <span className="fl-stack" data-fl-members="">
            {people.map((p, i) => (
              <Avatar key={p.id} p={p} z={people.length - i} />
            ))}
            {more > 0 ? (
              <span className="fl-avatar is-more">+{more}</span>
            ) : null}
          </span>
        </>
      }
    />
  );
}

/* ------------------------------------------------------------- the page */

interface Variant {
  id: string;
  label: string;
  name: string;
  line: string;
  Folder: (p: { item: LabItem }) => ReactNode;
}

export const VARIANTS: readonly Variant[] = [
  {
    id: "v1",
    label: "V1",
    name: "Frosted white",
    line: "Count badge and a status pill that says what needs you (due today, shared, synced).",
    Folder: V1,
  },
  {
    id: "v2",
    label: "V2",
    name: "Coloured glass",
    line: "The project colour as glass, an embossed glyph on the front, task titles peeking.",
    Folder: V2,
  },
  {
    id: "v3",
    label: "V3",
    name: "Papers peeking",
    line: "A slim pocket and a fan of papers; each paper carries a task title and its due day.",
    Folder: V3,
  },
  {
    id: "v4",
    label: "V4",
    name: "Stamp and clip",
    line: "A manila folder with the project sticker or app icon as a postage stamp, a clip on the papers.",
    Folder: V4,
  },
  {
    id: "v5",
    label: "V5",
    name: "App icons peeking",
    line: "The connected apps stand in the folder, real marks only; badge counts them.",
    Folder: V5,
  },
  {
    id: "v6",
    label: "V6",
    name: "Dark frosted",
    line: "Dark glass with the people on it and when it last changed.",
    Folder: V6,
  },
];

function Stage({
  id,
  theme,
  Folder,
}: {
  id: string;
  theme: "light" | "dark";
  Folder: Variant["Folder"];
}) {
  return (
    <div
      className="needt-v3 fl-stage"
      data-theme={theme === "dark" ? "dark" : undefined}
      data-lab-stage={`${id}-${theme}`}
    >
      <span className="fl-stage-tag">
        {theme === "dark" ? "Dark" : "Light"}
      </span>
      <div className="fl-grid">
        {LAB_ITEMS.map((item) => (
          <Folder key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

export function FolderLab({
  only,
  theme,
}: {
  only?: string;
  theme?: "light" | "dark";
}) {
  const list = VARIANTS.filter((v) => !only || v.id === only);
  return (
    <div className="fl-lab" data-lab="">
      <header className="fl-lab-head">
        <h1 className="fl-lab-title">Folders lab</h1>
        <p className="fl-lab-sub">
          Six looks for the project and doc folder. Not wired into the product:
          the live folders stay as they are until one is picked. Fixture data,
          clock fixed at 22.11.26 12:00.
        </p>
      </header>
      {list.map((v) => (
        <section
          key={v.id}
          className="fl-variant"
          id={v.id}
          data-lab-variant={v.id}
        >
          <div className="fl-variant-head">
            <span className="fl-variant-label">{v.label}</span>
            <span className="fl-variant-name">{v.name}</span>
            <span className="fl-variant-line">{v.line}</span>
          </div>
          <div className="fl-stages">
            {theme !== "dark" ? (
              <Stage id={v.id} theme="light" Folder={v.Folder} />
            ) : null}
            {theme !== "light" ? (
              <Stage id={v.id} theme="dark" Folder={v.Folder} />
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}
