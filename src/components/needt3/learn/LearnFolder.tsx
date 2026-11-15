/**
 * A stand-in for the shared Folder (`src/components/needt3/ui/Folder.tsx`,
 * PR #710) with exactly its props, so Learn can switch to it by changing one
 * import. Same idea, drawn small: a matte, translucent folder with up to three
 * sheets sticking out of the top, a sticker on the front, the label and a
 * count pill under it. One link (`href`) or one button (`onClick`); with
 * neither a static picture.
 *
 * //todo: swap to ui/Folder when #710 merges (delete this file and the
 * `ln-folder*` rules in learn.css; the props already match).
 */
import { type CSSProperties, type ReactNode, useId } from "react";

import Link from "next/link";

export interface LearnFolderPeek {
  key: string;
  title: string;
  meta?: string;
}

export interface LearnFolderProps {
  label: string;
  count?: number | string;
  sticker?: ReactNode;
  hue?: string;
  peeks: readonly LearnFolderPeek[];
  href?: string;
  onClick?: () => void;
  ariaLabel: string;
  className?: string;
  caption?: string;
  style?: CSSProperties;
  extra?: Record<`data-${string}`, string>;
}

const MAX_PEEKS = 3;
/** Each sheet's place: left %, tilt; the first is the front one. */
const FAN = [
  { left: 20, rot: 0 },
  { left: 6, rot: -8 },
  { left: 44, rot: 6 },
] as const;

export function LearnFolder({
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
}: LearnFolderProps) {
  const descId = useId();
  const shown = peeks.slice(0, MAX_PEEKS);
  const cls = `ln-folder${className ? ` ${className}` : ""}`;
  const style = {
    ...(hue ? { "--ln-folder-hue": hue } : null),
    ...extraStyle,
  } as CSSProperties;
  const body = (
    <>
      <span className="ln-folder-art" aria-hidden="true">
        <span className="ln-folder-back" />
        {shown.map((p, i) => (
          <span
            key={p.key}
            className="ln-folder-peek"
            data-folder-peek=""
            style={
              {
                "--ln-peek-left": `${FAN[i].left}%`,
                "--ln-peek-rot": `${FAN[i].rot}deg`,
                zIndex: shown.length - i,
              } as CSSProperties
            }
          >
            <span className="ln-folder-peek-mark" />
          </span>
        ))}
        <span className="ln-folder-front" />
        {sticker ? <span className="ln-folder-sticker">{sticker}</span> : null}
      </span>
      <span className="ln-folder-foot">
        <span className="ln-folder-label" title={label}>
          {label}
        </span>
        {count === undefined ? null : (
          <span className="ln-folder-count" data-folder-count="">
            {count}
          </span>
        )}
      </span>
      {caption ? <span className="ln-folder-caption">{caption}</span> : null}
      {shown.length ? (
        <span className="ln-folder-desc" id={descId}>
          {`Next: ${shown.map((p) => (p.meta ? `${p.title} (${p.meta})` : p.title)).join("; ")}`}
        </span>
      ) : null}
    </>
  );
  const describedBy = shown.length ? descId : undefined;
  if (href)
    return (
      <Link
        href={href}
        className={cls}
        style={style}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
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
        aria-describedby={describedBy}
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
      aria-describedby={describedBy}
      {...extra}
    >
      {body}
    </div>
  );
}
