"use client";

import type { ReactNode } from "react";

import type { PagePreviewBlock } from "@/lib/pages/page-preview";

import { DocMiniature } from "../docs/DocMini";
import { useDocTokens } from "../docs/DocParts";
import { pageVars, styleOf } from "../docs/style";

/**
 * A page-shaped card for Templates and Shared (the prototype borrows the
 * Docs grid's `DocCard`). It draws the title and a line of meta on a page of
 * the template's colour, and, when the template's first blocks are known (the
 * built-in set), a miniature of them under the title. A saved template's list
 * row carries no blocks, so its card is the plain page.
 */
export function PlDocCard({
  title,
  meta,
  label,
  onOpen,
  busy,
  rows,
  style,
}: {
  title: string;
  meta?: ReactNode;
  /** "Can edit" on a shared page. */
  label?: string;
  onOpen: () => void;
  busy?: boolean;
  /** The page's first blocks, drawn small under the title. */
  rows?: readonly PagePreviewBlock[];
  /** The page's style object (a built-in template's page colour). */
  style?: Record<string, unknown> | null;
}) {
  const read = useDocTokens();
  const s = styleOf({ coverUrl: null, style: style ?? null });
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
        className={style ? "dt-themed docs-card-page" : "docs-card-page"}
        style={
          style
            ? pageVars(s, read)
            : {
                ["--dt-page" as string]: "var(--surface-raised)",
                padding: 16,
              }
        }
      >
        {rows?.length ? (
          <div className="docs-doc-card-2 docs-doc-card-s1">
            <div className="docs-doc-card-3">
              <span className="docs-doc-card-5 docs-card-title">{title}</span>
              {meta ? <span className="base-meta">{meta}</span> : null}
            </div>
            <div className="docs-doc-card-7 docs-doc-card-s2">
              <DocMiniature rows={rows} />
            </div>
          </div>
        ) : (
          <>
            <span className="docs-doc-card-5 docs-card-title">{title}</span>
            {meta ? (
              <span className="base-meta" style={{ marginTop: 8 }}>
                {meta}
              </span>
            ) : null}
          </>
        )}
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
