import type { ReactNode } from "react";

import { type Block, type Inline, parseMarkdown } from "@/lib/legal/markdown";

const LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/subprocessors", label: "Subprocessors" },
] as const;

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return node.value;
      case "strong":
        return (
          <strong key={index} className="font-semibold">
            {renderInline(node.children)}
          </strong>
        );
      case "code":
        return (
          <code
            key={index}
            className="break-all rounded bg-[var(--surface-hover)] px-1 py-0.5 font-mono text-[0.9em]"
          >
            {node.value}
          </code>
        );
      case "link": {
        const external = /^https?:\/\//.test(node.href);
        return (
          <a
            key={index}
            href={node.href}
            className="underline underline-offset-2 hover:text-[var(--text-primary)]"
            {...(external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {renderInline(node.children)}
          </a>
        );
      }
    }
  });
}

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.type) {
    case "heading":
      if (block.level === 1) {
        return (
          <h1
            key={index}
            id={block.id}
            className="text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            {renderInline(block.children)}
          </h1>
        );
      }
      if (block.level === 2) {
        return (
          <h2
            key={index}
            id={block.id}
            className="mt-10 scroll-mt-6 text-xl font-semibold"
          >
            {renderInline(block.children)}
          </h2>
        );
      }
      return (
        <h3
          key={index}
          id={block.id}
          className="mt-6 scroll-mt-6 text-base font-semibold"
        >
          {renderInline(block.children)}
        </h3>
      );
    case "paragraph":
      return (
        <p key={index} className="mt-4 text-base leading-7">
          {renderInline(block.children)}
        </p>
      );
    case "list":
      return (
        <ul
          key={index}
          className="mt-4 list-disc space-y-2 pl-6 text-base leading-7"
        >
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div key={index} className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm leading-6">
            <thead>
              <tr>
                {block.head.map((cell, cellIndex) => (
                  <th
                    key={cellIndex}
                    scope="col"
                    className="border-b border-[var(--border)] py-2 pr-4 align-bottom font-semibold"
                  >
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="border-b border-[var(--border-subtle)] py-2 pr-4 align-top text-[var(--text-secondary)]"
                    >
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "quote":
      return (
        <blockquote
          key={index}
          className="mt-4 border-l-2 border-[var(--border)] pl-4"
        >
          {block.children.map(renderBlock)}
        </blockquote>
      );
    case "rule":
      return <hr key={index} className="mt-10 border-[var(--border-subtle)]" />;
  }
}

/**
 * A published legal document: the Markdown from `src/lib/legal/documents`,
 * set for reading. A server component with plain links, so the pages render
 * without the app shell or a session.
 */
export function LegalDocument({ markdown }: { markdown: string }) {
  const blocks = parseMarkdown(markdown);
  return (
    <main className="min-h-dvh bg-[var(--surface-canvas)] px-4 py-12 text-[var(--text-primary)] sm:px-6 sm:py-16">
      <article className="mx-auto max-w-3xl">
        <nav
          aria-label="Legal documents"
          className="mb-8 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]"
        >
          <a href="https://needt.app" className="font-semibold">
            Needt
          </a>
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className="hover:underline">
              {link.label}
            </a>
          ))}
        </nav>
        {blocks.map(renderBlock)}
      </article>
    </main>
  );
}
