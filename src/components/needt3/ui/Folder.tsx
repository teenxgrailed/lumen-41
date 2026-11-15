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
 *   peeks      Peek[]          0 to 3 sheets, `{ key, title, meta? }`. A sheet
 *                              shows only a mark, never text; the titles go
 *                              to a hidden description. More than 3 are ignored.
 *                              None: an empty folder.
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
 * Hover and keyboard focus lift the sheets a few pixels; under
 * `prefers-reduced-motion` they do not move. Focus draws `--shadow-focus`.
 */
import { type CSSProperties, type ReactNode, useId } from "react";

import Link from "next/link";

export interface FolderPeek {
  key: string;
  title: string;
  meta?: string;
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
}

/** How many sheets a folder shows. */
export const FOLDER_MAX_PEEKS = 3;

/**
 * Where each sheet sits (% of the folder), its width, tilt and tint. The
 * first sheet is the front one (left of centre, upright, no tint); the others
 * lean out behind it, narrower, one each side.
 */
const FAN: readonly {
  left: number;
  top: number;
  w: number;
  rot: number;
  tint: number;
}[][] = [
  [],
  [{ left: 18, top: 12, w: 40, rot: 0, tint: 0 }],
  [
    { left: 18, top: 12, w: 40, rot: 0, tint: 0 },
    { left: 3, top: 17, w: 32, rot: -9, tint: 16 },
  ],
  [
    { left: 18, top: 12, w: 40, rot: 0, tint: 0 },
    { left: 3, top: 17, w: 32, rot: -9, tint: 16 },
    { left: 48, top: 18, w: 32, rot: 6, tint: 8 },
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
}: FolderProps) {
  const descId = useId();
  const shown = peeks.slice(0, FOLDER_MAX_PEEKS);
  const fan = FAN[shown.length];
  const cls = `nx-folder${className ? ` ${className}` : ""}`;
  const style = {
    ...(hue ? { "--nx-folder-hue": hue } : null),
    ...extraStyle,
  } as CSSProperties;
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
          </span>
        ))}
        <span className="nx-folder-front" />
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
      {shown.length ? (
        <span className="nx-folder-desc" id={descId}>
          {`Next: ${shown.map((p) => p.title).join("; ")}`}
        </span>
      ) : null}
    </>
  );
  const description = shown.length > 0;
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
