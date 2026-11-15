/**
 * Folder: a matte, frosted folder with up to three sheets of paper sticking
 * out of the top, a sticker on the front wall, and its label and count under
 * it. The whole folder is ONE link (`href`) or ONE button (`onClick`).
 *
 * Pure CSS (src/styles/v3-overrides/folder.css, class prefix `nx-folder`), no
 * images, light and dark through the ladder tokens. Reused by Projects, Docs,
 * Budget and the landing page, so the API stays this small:
 *
 *   label      string       Under the folder; ellipsised, never wraps.
 *   count      number?      A pill next to the label. Omit it for no pill.
 *   sticker    ReactNode    Sits on the front wall (an icon, an emoji, a mark).
 *   hue        string?      Any CSS colour. A tint on the frosted panels and
 *                           the sticker ring, never a solid fill (PORT.md 0.3).
 *   peeks      Peek[]       0 to 3 sheets, `{ key, title, meta? }`, the first
 *                           one in front and the only one that prints its
 *                           title and meta (the others show a paper edge).
 *                           More than 3 are ignored. None: an empty folder.
 *   href       string?      Renders a Next link. Wins over `onClick`.
 *   onClick    () => void   Renders a button.
 *   ariaLabel  string       The accessible name ("Open Operations").
 *   className  string?      Extra classes on the root.
 *   extra      data-*       Extra data attributes on the root (context menus).
 *
 * Hover and keyboard focus lift the sheets a few pixels; under
 * `prefers-reduced-motion` they do not move. Focus draws the accent ring.
 */
import type { CSSProperties, ReactNode } from "react";

import Link from "next/link";

export interface FolderPeek {
  key: string;
  title: string;
  meta?: string;
}

export interface FolderProps {
  label: string;
  count?: number;
  sticker: ReactNode;
  hue?: string;
  peeks: readonly FolderPeek[];
  href?: string;
  onClick?: () => void;
  ariaLabel: string;
  className?: string;
  extra?: Record<`data-${string}`, string>;
}

/** How many sheets a folder shows. */
export const FOLDER_MAX_PEEKS = 3;

/** Rotation (deg) and sideways shift (% of the folder width) per sheet. */
const FAN: Record<number, readonly { rot: number; dx: number }[]> = {
  1: [{ rot: -2, dx: 0 }],
  2: [
    { rot: 3, dx: 5 },
    { rot: -6, dx: -6 },
  ],
  3: [
    { rot: 0, dx: 0 },
    { rot: -7, dx: -9 },
    { rot: 6, dx: 9 },
  ],
};

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
  extra,
}: FolderProps) {
  const shown = peeks.slice(0, FOLDER_MAX_PEEKS);
  const fan = FAN[shown.length] ?? [];
  const cls = `nx-folder${className ? ` ${className}` : ""}`;
  const style = hue ? ({ "--nx-folder-hue": hue } as CSSProperties) : undefined;
  const body = (
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
                "--nx-peek-rot": `${fan[i]?.rot ?? 0}deg`,
                "--nx-peek-dx": `${fan[i]?.dx ?? 0}%`,
                "--nx-peek-dy": `${i * -7}px`,
                zIndex: shown.length - i,
              } as CSSProperties
            }
          >
            {i === 0 ? (
              <>
                <span className="nx-folder-peek-title">{p.title}</span>
                {p.meta ? (
                  <span className="nx-folder-peek-meta">{p.meta}</span>
                ) : null}
              </>
            ) : (
              <span className="nx-folder-peek-bar" />
            )}
          </span>
        ))}
        <span className="nx-folder-front" />
        <span className="nx-folder-sticker">{sticker}</span>
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
    </>
  );
  if (href)
    return (
      <Link
        href={href}
        className={cls}
        style={style}
        aria-label={ariaLabel}
        {...extra}
      >
        {body}
      </Link>
    );
  return (
    <button
      type="button"
      className={cls}
      style={style}
      aria-label={ariaLabel}
      onClick={onClick}
      {...extra}
    >
      {body}
    </button>
  );
}
