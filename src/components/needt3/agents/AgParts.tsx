"use client";

import type { ReactNode } from "react";

import { FiChevronRight } from "react-icons/fi";

import { Art, type ArtName } from "../menu/Art";
import { PlEmpty } from "../states/StScreen";

export type AgTone =
  | "none"
  | "muted"
  | "accent"
  | "info"
  | "success"
  | "danger";

/** A section: the quiet h2 of the other places, an optional hint, then rows. */
export function AgSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="ag-h">{title}</h2>
      {hint ? <p className="ag-hint">{hint}</p> : null}
      <div className="ag-list">{children}</div>
    </section>
  );
}

/**
 * One row at the Trash row geometry: a status mark, title over a quiet line,
 * actions on the right. With `onToggle` the text is a button and `detail`
 * opens under the row.
 */
export function AgRow({
  title,
  meta,
  tone = "none",
  actions,
  expanded,
  onToggle,
  detail,
}: {
  title: ReactNode;
  meta?: ReactNode;
  tone?: AgTone;
  actions?: ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  detail?: ReactNode;
}) {
  const body = (
    <>
      <span className={`ag-mark is-${tone}`} aria-hidden="true" />
      <span className="ag-text">
        <span className="ag-title">{title}</span>
        {meta ? <span className="ag-meta">{meta}</span> : null}
      </span>
      {onToggle ? (
        <FiChevronRight
          size={14}
          aria-hidden
          className={`ag-chev${expanded ? " is-open" : ""}`}
        />
      ) : null}
    </>
  );
  return (
    <div className="ag-item nx-swap" data-ag-row="">
      <div className="ag-row">
        {onToggle ? (
          <button
            type="button"
            className="ag-main"
            aria-expanded={Boolean(expanded)}
            onClick={onToggle}
          >
            {body}
          </button>
        ) : (
          <div className="ag-main">{body}</div>
        )}
        {actions ? <span className="ag-actions">{actions}</span> : null}
      </div>
      {expanded && detail ? <div className="ag-detail">{detail}</div> : null}
    </div>
  );
}

/** The empty state of a section: the place's art, a title, one line. */
export function AgEmpty({
  art,
  title,
  line,
}: {
  art: ArtName;
  title: string;
  line: string;
}) {
  return (
    <div className="ag-empty" data-ag-empty="">
      <PlEmpty art={<Art name={art} size={48} />} title={title} line={line} />
    </div>
  );
}

/** A small button in the nx-btn family. */
export function AgBtn({
  children,
  tone = "secondary",
  pressed,
  disabled,
  onClick,
}: {
  children: ReactNode;
  tone?: "secondary" | "text" | "danger";
  disabled?: boolean;
  pressed?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`nx-btn nx-btn-sm nx-btn-${tone}`}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
