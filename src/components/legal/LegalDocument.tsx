import type { ReactNode } from "react";

import { PublicScope } from "@/components/needt3/states/PublicScope";

import { type Block, type Inline, parseMarkdown } from "@/lib/legal/markdown";

import { LegalHomeLink } from "./LegalHomeLink";
import { AppStoreOnly, WebBillingOnly, WebOnly } from "./WebOnly";

const LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/subprocessors", label: "Subprocessors" },
  { href: "/support", label: "Support" },
] as const;

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return node.value;
      case "strong":
        return <strong key={index}>{renderInline(node.children)}</strong>;
      case "code":
        return <code key={index}>{node.value}</code>;
      case "link": {
        const external = /^https?:\/\//.test(node.href);
        return (
          <a
            key={index}
            href={node.href}
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

function renderBlock(
  block: Block,
  index: number,
  appleIap: boolean
): ReactNode {
  const render = (child: Block, i: number) => renderBlock(child, i, appleIap);
  switch (block.type) {
    case "heading":
      if (block.level === 1) {
        return (
          <h1 key={index} id={block.id}>
            {renderInline(block.children)}
          </h1>
        );
      }
      if (block.level === 2) {
        return (
          <h2 key={index} id={block.id}>
            {renderInline(block.children)}
          </h2>
        );
      }
      return (
        <h3 key={index} id={block.id}>
          {renderInline(block.children)}
        </h3>
      );
    case "paragraph":
      return <p key={index}>{renderInline(block.children)}</p>;
    case "list":
      return (
        <ul key={index}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div key={index} className="pub-table-wrap">
          <table>
            <thead>
              <tr>
                {block.head.map((cell, cellIndex) => (
                  <th key={cellIndex} scope="col">
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "quote":
      return <blockquote key={index}>{block.children.map(render)}</blockquote>;
    case "web-only":
      return (
        <WebOnly key={index} appleIap={appleIap}>
          {block.children.map(render)}
        </WebOnly>
      );
    case "app-store":
      return (
        <AppStoreOnly key={index} appleIap={appleIap}>
          {block.children.map(render)}
        </AppStoreOnly>
      );
    case "web-billing":
      return (
        <WebBillingOnly key={index} appleIap={appleIap}>
          {block.children.map(render)}
        </WebBillingOnly>
      );
    case "rule":
      return <hr key={index} />;
  }
}

/**
 * A published legal document: the Markdown from `src/lib/legal/documents`,
 * set for reading. A server component with plain links, so the pages render
 * without the app shell or a session.
 */
/**
 * `appleIap`: App Store purchases are on (the `apple_iap` flag for everyone),
 * read by the page when it is served. Only the terms have text that depends on
 * it; the other documents leave it off.
 */
export function LegalDocument({
  markdown,
  appleIap = false,
}: {
  markdown: string;
  appleIap?: boolean;
}) {
  const blocks = parseMarkdown(markdown);
  return (
    <PublicScope>
      <main className="pub-page is-narrow">
        <nav aria-label="Legal documents" className="pub-nav">
          <LegalHomeLink />
          {LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <article className="pub-card is-doc pub-doc">
          {blocks.map((block, index) => renderBlock(block, index, appleIap))}
        </article>
      </main>
    </PublicScope>
  );
}
