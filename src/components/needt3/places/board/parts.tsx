"use client";

import type { CSSProperties, PropsWithChildren } from "react";

import type { V3BoardItem } from "@/lib/needt3/hooks/boards";

import { Sheet } from "../../ctx/Sheet";
import { Art, type ArtName } from "../../menu/Art";
import { hueOf, initials, isFigma, luminance } from "./logic";

const tint = (domain: string, k = 22) =>
  `color-mix(in oklch, oklch(0.68 0.11 ${hueOf(domain)}) ${k}%, var(--surface-raised))`;

const bg = (value: string) => ({ "--pl-bg": value }) as CSSProperties;
const hue = (value: number) => ({ "--pl-hue": value }) as CSSProperties;

/** What a reference looks like inside its frame, at any size (places.jsx `Visual`). */
export function Visual({ it, big }: { it: V3BoardItem; big?: boolean }) {
  const frame = "pl-visual-frame" + (big ? " is-big" : "");
  if (it.kind === "image")
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a stored or uploaded reference, sized by its own ratio
      <img
        src={it.url ?? ""}
        alt={it.title || ""}
        draggable={false}
        loading="lazy"
        className={frame + " is-image"}
      />
    );
  if (it.kind === "color") {
    const color = it.color ?? "#8a8178";
    return (
      <span
        className={frame}
        style={{ aspectRatio: 1 / (it.ratio || 1), ...bg(color) }}
      >
        <span
          className={
            "pl-visual-abs" + (luminance(color) > 0.18 ? " is-on-light" : "")
          }
        >
          {color.toUpperCase()}
        </span>
      </span>
    );
  }
  if (it.kind === "note")
    return (
      <span className={frame + " is-note"}>
        <span className="pl-visual-el">{it.text}</span>
      </span>
    );
  const domain = it.source?.domain ?? "";
  if (it.thumbnailUrl)
    return (
      <span
        className={frame}
        style={{ aspectRatio: 1 / (it.ratio || 0.72), ...bg(tint(domain, 26)) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the page's own picture, hotlinked */}
        <img
          src={it.thumbnailUrl}
          alt=""
          draggable={false}
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </span>
    );
  return (
    <span
      className={frame}
      style={{ aspectRatio: 1 / (it.ratio || 0.72), ...bg(tint(domain, 26)) }}
    >
      <span aria-hidden="true" className="pl-visual-abs-2">
        <span className="pl-visual-abs-3" style={bg(tint(domain, 60))} />
        <span className="pl-visual-abs-4" style={bg(tint(domain, 34))} />
      </span>
      {isFigma(it) ? <span className="pl-visual-abs-5">Figma</span> : null}
    </span>
  );
}

/** The site's initial on a tinted tile (a link has no real favicon here). */
export function FavBadge({
  it,
  size = 18,
}: {
  it: V3BoardItem;
  size?: number;
}) {
  const domain = it.source?.domain ?? "";
  return (
    <span
      aria-hidden="true"
      className="pl-fav-badge-grid"
      style={{
        ...hue(hueOf(domain)),
        width: size,
        height: size,
        font: `700 ${Math.round(size * 0.55)}px/1 var(--font-sans)`,
      }}
    >
      {(it.source?.name ?? "?").charAt(0).toUpperCase()}
    </span>
  );
}

export interface Face {
  key: string;
  name: string;
}

/** Overlapping initials, at most `max`, and "+n" for the rest. */
export function Avatars({
  people,
  size = 20,
  max = 4,
  total,
}: {
  people: readonly Face[];
  size?: number;
  max?: number;
  /** How many there are in all, when the list is only the first few. */
  total?: number;
}) {
  const list = people.slice(0, max);
  const more = (total ?? people.length) - list.length;
  return (
    <span
      className="pl-avatars-row"
      title={people.map((m) => m.name).join(", ")}
    >
      {list.map((m, i) => (
        <span
          key={m.key}
          className="pl-avatars-grid"
          style={{
            ...hue(hueOf(m.key)),
            width: size,
            height: size,
            marginLeft: i ? -size * 0.3 : 0,
            borderRadius: size,
            font: `600 ${Math.round(size * 0.42)}px/1 var(--font-sans)`,
          }}
        >
          {initials(m.name)}
        </span>
      ))}
      {more > 0 ? <span className="pl-avatars-text">+{more}</span> : null}
    </span>
  );
}

/** A centred sheet (places.jsx `Dialog`) on Radix, portalled into the v3 scope. */
export function BoardDialog({
  open,
  onClose,
  label,
  width,
  children,
}: PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  label: string;
  width?: number;
}>) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={label}
      scrimClassName="nx-scrim pl-habit-sheet-grid"
      className="nx-sheet mb-dialog pl-dialog-col"
      style={{ maxWidth: width ?? 440 }}
    >
      {children}
    </Sheet>
  );
}

export function DialogHead({
  art,
  title,
  sub,
}: {
  art?: ArtName;
  title: string;
  sub?: string;
}) {
  return (
    <div className="pl-row-12">
      {art ? <Art name={art} size={32} /> : null}
      <span className="pl-dlg-head-col">
        <span className="pl-sheet-title">{title}</span>
        {sub ? <span className="pl-meta">{sub}</span> : null}
      </span>
    </div>
  );
}

export const DialogFoot = ({ children }: PropsWithChildren) => (
  <div className="pl-dlg-head-row">{children}</div>
);
