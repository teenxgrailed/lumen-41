/**
 * Folder: a matte, frosted folder with up to three sheets of paper sticking
 * out of the top, a sticker on the front wall, and its label and count under
 * it. The whole folder is ONE link (`href`) or ONE button (`onClick`); with
 * neither it is a plain, non-focusable div (a static illustration).
 *
 * Pure CSS (src/styles/v3-overrides/folder.css, class prefix `nx-folder`), no
 * images, light and dark through tokens. Reused by Projects, Docs, Budget and
 * the landing page, so the API stays this small:
 *
 *   label      string          Under the folder; ellipsised, never wraps.
 *   count      number|string?  A pill next to the label ("4", "83 photos").
 *                              Omit it for no pill; 0 is shown.
 *   sticker    ReactNode?      Sits on the front wall (icon, emoji, mark).
 *   hue        string?         Any CSS colour. A tint on the panels and the
 *                              sticker ring, never a solid fill (PORT.md 0.3).
 *   peeks      Peek[]          0 to 3 sheets, `{ key, title, meta?, muted? }`.
 *                              A sheet shows a status circle and its title on
 *                              one truncated line; the titles also go to a
 *                              hidden description. `muted` is a placeholder
 *                              line ("No open tasks"). More than 3 are
 *                              ignored. None: an empty folder.
 *   caption    string?         A second line under the label, 12px, one line,
 *                              truncated ("Next: German vocabulary").
 *   href       string?         Renders a Next link. Wins over `onClick`.
 *   onClick    () => void      Renders a button.
 *   ariaLabel  string          The accessible name ("Open Operations, 4 open").
 *   className  string?         Extra classes on the root.
 *   style      CSSProperties?  Extra inline style (an entry `animationDelay`).
 *   extra      data-*          Extra data attributes on the root.
 *
 * Tokens the host must define (the needt-ds-tokens set): --surface-raised,
 * --fill-4, --fill-5, --fill-6, --text-primary, --text-secondary,
 * --text-tertiary, --text-muted, --shadow-ring, --shadow-focus, --foreground-rgb,
 * --transition-hover, --font-sans. `--accent` is not used.
 *
 * `folderStyle` (1..6, see `lib/needt3/folder-style.ts`) draws one of the six
 * looks instead of the plain folder (`FolderStyled.tsx`); it reads these too:
 *
 *   glyph       ReactNode?   The mark pressed into the front (emoji, letter or icon).
 *   unit        string?      What `count` counts ("open", "pages").
 *   statusLabel string?      The look-1 pill ("3 due today"); none without it.
 *   updatedAt   number?      ms; "Updated 12m" under the label.
 *   now         number?      ms; the clock `updatedAt` is read against.
 *   members     {id,name}[]? Avatars on look 6, only when known.
 *   apps        BrandId[]?   The connected apps (look 5, whose absence means look 1).
 *
 * Hover and keyboard focus lift the sheets a few pixels; under
 * `prefers-reduced-motion` they do not move. Focus draws `--shadow-focus`.
 */
import { type CSSProperties, type ReactNode, useId, useState } from "react";

import Link from "next/link";

import { type FolderStyleId } from "@/lib/needt3/folder-style";

import { type BrandId } from "../brand";
import { FolderArt, effectiveStyle, folderMeta } from "./FolderStyled";

export interface FolderPeek {
  key: string;
  title: string;
  meta?: string;
  /** A placeholder line ("No open tasks"): quieter, left out of the description. */
  muted?: boolean;
}

export interface FolderProps {
  label: string;
  count?: number | string;
  sticker?: ReactNode;
  hue?: string;
  peeks: readonly FolderPeek[];
  href?: string;
  onClick?: () => void;
  ariaLabel: string;
  className?: string;
  /** A second line under the label (12px, one line, truncated). */
  caption?: string;
  style?: CSSProperties;
  extra?: Record<`data-${string}`, string>;
  /** One of the six looks; without it the plain folder is drawn. */
  folderStyle?: FolderStyleId;
  glyph?: ReactNode;
  unit?: string;
  statusLabel?: string;
  updatedAt?: number | null;
  now?: number;
  members?: readonly { id: string; name: string }[];
  apps?: readonly BrandId[];
  kind?: "project" | "docs" | "topic";
}

/** How many sheets a folder shows. */
export const FOLDER_MAX_PEEKS = 3;

/**
 * Where each sheet sits (% of the folder), its width, tilt and tint. The
 * sheets climb like a deck: the first is the lowest and nearest, each next
 * one sits a row higher and a little narrower, so every sheet shows its top
 * line (a status circle and a title) above the one in front of it.
 */
const FAN: readonly {
  left: number;
  top: number;
  w: number;
  rot: number;
  tint: number;
}[][] = [
  [],
  [{ left: 14, top: 26, w: 72, rot: -1, tint: 0 }],
  [
    { left: 10, top: 28, w: 72, rot: -1, tint: 0 },
    { left: 18, top: 14, w: 68, rot: 2, tint: 10 },
  ],
  [
    { left: 10, top: 28, w: 72, rot: -1, tint: 0 },
    { left: 18, top: 14, w: 68, rot: 2, tint: 10 },
    { left: 12, top: 1, w: 64, rot: -3, tint: 16 },
  ],
];

export function Folder({
  label,
  count,
  sticker,
  hue,
  peeks,
  href,
  onClick,
  ariaLabel,
  className,
  caption,
  style: extraStyle,
  extra,
  folderStyle,
  glyph,
  unit,
  statusLabel,
  updatedAt,
  now,
  members,
  apps,
  kind,
}: FolderProps) {
  const descId = useId();
  const [mountedAt] = useState(() => Date.now());
  const shown = peeks.slice(0, FOLDER_MAX_PEEKS);
  const fan = FAN[shown.length];
  const real = shown.filter((p) => !p.muted);
  const look = folderStyle ? effectiveStyle(folderStyle, apps) : null;
  const cls = look
    ? `fl fl-v${look}${className ? ` ${className}` : ""}`
    : `nx-folder${className ? ` ${className}` : ""}`;
  const style = {
    ...(hue ? { "--nx-folder-hue": hue, "--fl-hue": hue } : null),
    ...extraStyle,
  } as CSSProperties;
  const styled = look ? (
    <>
      <span className="fl-card" aria-hidden="true" />
      <span className="fl-art" aria-hidden="true">
        <span className="fl-glow" />
        <span className="fl-back" />
        <FolderArt
          style={look}
          d={{
            count,
            unit,
            glyph: glyph ?? sticker,
            peeks: shown,
            caption,
            statusLabel,
            updatedAt,
            now: now ?? mountedAt,
            members,
            apps,
            kind,
          }}
        />
      </span>
      <span className="fl-foot">
        <span className="fl-title" title={label}>
          {label}
        </span>
        <span className="fl-meta">
          {folderMeta(look, {
            count,
            unit,
            peeks: shown,
            caption,
            updatedAt,
            now: now ?? mountedAt,
            members,
            apps,
          })}
        </span>
      </span>
      {real.length ? (
        <span className="nx-folder-desc" id={descId}>
          {`Next: ${real.map((p) => (p.meta ? `${p.title} (${p.meta})` : p.title)).join("; ")}`}
        </span>
      ) : null}
    </>
  ) : null;
  const body = styled ?? (
    <>
      <span className="nx-folder-art" aria-hidden="true">
        <span className="nx-folder-back" />
        {shown.map((p, i) => (
          <span
            key={p.key}
            className="nx-folder-peek"
            data-folder-peek=""
            data-title={p.title}
            style={
              {
                "--nx-peek-left": `${fan[i].left}%`,
                "--nx-peek-top": `${fan[i].top}%`,
                "--nx-peek-w": `${fan[i].w}%`,
                "--nx-peek-rot": `${fan[i].rot}deg`,
                "--nx-peek-tint": `${fan[i].tint}%`,
                zIndex: shown.length - i,
              } as CSSProperties
            }
          >
            <span className="nx-folder-peek-mark" />
            <span
              className={`nx-folder-peek-title${p.muted ? " is-muted" : ""}`}
            >
              {p.title}
            </span>
          </span>
        ))}
        <span className="nx-folder-front" />
        <span className="nx-folder-shoulder" />
        {sticker ? <span className="nx-folder-sticker">{sticker}</span> : null}
      </span>
      <span className="nx-folder-foot">
        <span className="nx-folder-label" title={label}>
          {label}
        </span>
        {count === undefined ? null : (
          <span className="nx-folder-count" data-folder-count="">
            {count}
          </span>
        )}
      </span>
      {caption ? <span className="nx-folder-caption">{caption}</span> : null}
      {real.length ? (
        <span className="nx-folder-desc" id={descId}>
          {`Next: ${real.map((p) => (p.meta ? `${p.title} (${p.meta})` : p.title)).join("; ")}`}
        </span>
      ) : null}
    </>
  );
  const description = real.length > 0;
  if (href)
    return (
      <Link
        href={href}
        className={cls}
        style={style}
        aria-label={ariaLabel}
        aria-describedby={description ? descId : undefined}
        {...extra}
      >
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button
        type="button"
        className={cls}
        style={style}
        aria-label={ariaLabel}
        aria-describedby={description ? descId : undefined}
        onClick={onClick}
        {...extra}
      >
        {body}
      </button>
    );
  return (
    <div
      role="img"
      className={cls}
      style={style}
      aria-label={ariaLabel}
      aria-describedby={description ? descId : undefined}
      {...extra}
    >
      {body}
    </div>
  );
}
