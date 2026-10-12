import type { ReactNode } from "react";

import type { PagePreviewBlock } from "@/lib/pages/page-preview";

/**
 * One preview row in miniature (prototype docs-kit.jsx `MiniBlock`), drawn
 * with the vendored `docs-mini-*` classes. The text is plain: it reaches the
 * page as a React text child, never as markup.
 */
function MiniRow({ row, n }: { row: PagePreviewBlock; n: number }) {
  const { type, text } = row;
  if (type === "h1" || type === "h2" || type === "h3") {
    return <div className="docs-mini-block-1">{text}</div>;
  }
  if (type === "lead") {
    return <div className="docs-mini-p docs-mini-lead">{text}</div>;
  }
  if (type === "callout")
    return <div className="docs-mini-block-2">{text}</div>;
  if (type === "quote") {
    return <div className="docs-mini-p docs-mini-quote">{text}</div>;
  }
  if (type === "li" || type === "ol") {
    return (
      <div className="docs-mini-p docs-mini-li">
        <span>{type === "ol" ? `${n}.` : "•"}</span>
        <span>{text}</span>
      </div>
    );
  }
  if (type === "todo") {
    return (
      <div
        className={"docs-mini-p docs-mini-todo" + (row.checked ? " is-on" : "")}
      >
        <span
          className={
            "docs-mini-block-3 docs-mini-block-s1" +
            (row.checked ? " is-on" : "")
          }
        />
        {text}
      </div>
    );
  }
  if (type === "rule") return <div className="docs-mini-block-4" />;
  if (type === "code") return <div className="docs-mini-code">{text}</div>;
  if (type === "image") {
    // The prototype's picture block: a screenshot drawn in bars.
    return (
      <div className="docs-mini-block-5">
        <div className="docs-mini-block-6">
          <div className="docs-mini-block-7">
            {[70, 50, 60, 40].map((w) => (
              <span
                className="docs-mini-block-8"
                key={w}
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
          <div className="docs-mini-block-7">
            <span className="docs-mini-block-9" />
            {[90, 75, 82].map((w) => (
              <span
                className="docs-mini-block-8"
                key={w}
                style={{ width: `${w}%` }}
              />
            ))}
            <span className="docs-mini-block-10" />
          </div>
        </div>
      </div>
    );
  }
  return <p className="docs-mini-p">{text}</p>;
}

/** The preview rows themselves, for a page that is already scaled. */
export function MiniRows({ rows }: { rows: readonly PagePreviewBlock[] }) {
  let run = 0;
  const items: ReactNode[] = rows.map((row, i) => {
    run = row.type === "ol" ? run + 1 : 0;
    return <MiniRow key={i} row={row} n={run} />;
  });
  return <>{items}</>;
}

/**
 * The first blocks of a document, drawn small inside its card
 * (prototype `DocMiniature`, scale 0.5). Draws nothing for an empty page.
 * It is decoration: the card's title is its accessible name.
 */
export function DocMiniature({ rows }: { rows: readonly PagePreviewBlock[] }) {
  if (rows.length === 0) return null;
  return (
    <div
      className="docs-mini-doc-1 docs-mini-half"
      aria-hidden="true"
      data-docs-mini=""
    >
      <MiniRows rows={rows} />
    </div>
  );
}
