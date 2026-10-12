"use client";

import type { ReactNode } from "react";

/**
 * A page-shaped card for Templates and Shared (the prototype borrows the
 * Docs grid's `DocCard`). It draws the title and a line of meta on a plain
 * page; the doc's own style and first blocks are not drawn here.
 * //todo: swap for the Docs `DocCard` once T13 is in port/integration.
 */
export function PlDocCard({
  title,
  meta,
  label,
  onOpen,
  busy,
}: {
  title: string;
  meta?: ReactNode;
  /** "Can edit" on a shared page. */
  label?: string;
  onOpen: () => void;
  busy?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-busy={busy || undefined}
      aria-label={`Open ${title}`}
      className="docs-card nx-press nx-focus"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && e.key === "Enter") onOpen();
      }}
    >
      <div
        className="docs-card-page"
        style={{
          ["--dt-page" as string]: "var(--surface-raised)",
          padding: 16,
        }}
      >
        <span className="docs-doc-card-5 docs-card-title">{title}</span>
        {meta ? (
          <span className="base-meta" style={{ marginTop: 8 }}>
            {meta}
          </span>
        ) : null}
      </div>
      {label ? (
        <span
          className="base-meta"
          style={{ padding: "8px 16px", color: "var(--text-tertiary)" }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
