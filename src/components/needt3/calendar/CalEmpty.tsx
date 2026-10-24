"use client";

import Link from "next/link";

import { FiCalendar } from "react-icons/fi";

import { CAL_EMPTY_COPY, type CalendarEmpty } from "./empty";

/**
 * The empty week on the desktop: a card over the grid, not a screen of its
 * own, so the grid stays usable around it (`empty.ts` says when). The layer
 * lets clicks through; only the card takes them.
 */
export function CalEmpty({
  state,
  onAdd,
}: {
  state: CalendarEmpty;
  onAdd: () => void;
}) {
  if (!state) return null;
  if (state === "quiet") {
    return (
      <div className="c2-empty is-quiet" data-c2-empty="quiet">
        <span className="c2-empty-hint">{CAL_EMPTY_COPY.quiet}</span>
      </div>
    );
  }
  return (
    <div className="c2-empty" data-c2-empty="connect">
      <div className="c2-empty-card">
        <span className="c2-empty-icon">
          <FiCalendar size={16} aria-hidden />
        </span>
        <span className="c2-empty-text">{CAL_EMPTY_COPY.line}</span>
        <span className="c2-empty-acts">
          <button
            type="button"
            className="nx-btn nx-btn-text nx-btn-sm"
            data-c2-empty-add=""
            onClick={onAdd}
          >
            {CAL_EMPTY_COPY.add}
          </button>
          <Link
            href="/connections"
            className="nx-btn nx-btn-primary nx-btn-sm"
            data-c2-empty-connect=""
          >
            {CAL_EMPTY_COPY.connect}
          </Link>
        </span>
      </div>
    </div>
  );
}
