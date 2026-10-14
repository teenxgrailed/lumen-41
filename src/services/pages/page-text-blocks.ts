import type { PageBlockInput } from "@/services/pages/page-write-path";
import { PageAuthor } from "@prisma/client";
import type { JSONContent } from "@tiptap/core";

import { pageBlocksFromDocument } from "@/components/pages/page-document";

/** Longest body one connector call may write, in characters. */
export const PAGE_TEXT_MAX_LENGTH = 100_000;

export type PageTextFormat = "markdown" | "plain";

function textNodes(lines: string[]): JSONContent[] | undefined {
  const content: JSONContent[] = [];
  lines.forEach((line, index) => {
    if (index > 0) content.push({ type: "hardBreak" });
    if (line) content.push({ type: "text", text: line });
  });
  // A paragraph made only of breaks is still an empty paragraph.
  return content.some((node) => node.type === "text") ? content : undefined;
}

function paragraph(lines: string[]): JSONContent {
  return { type: "paragraph", content: textNodes(lines) };
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const TASK = /^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^```\s*([\w+-]*)\s*$/;

/**
 * Turns Markdown into the editor's document nodes: headings, bulleted,
 * numbered and check lists, quotes, code fences, rules and paragraphs. Inline
 * Markdown (bold, links) stays as literal text.
 */
function markdownNodes(text: string): JSONContent[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const nodes: JSONContent[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const fence = FENCE.exec(line);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1; // closing fence
      const body = code.join("\n");
      nodes.push({
        type: "codeBlock",
        attrs: { language: fence[1] || null },
        content: body ? [{ type: "text", text: body }] : undefined,
      });
      continue;
    }
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      nodes.push({
        type: "heading",
        attrs: { level: Math.min(3, heading[1].length) },
        content: textNodes([heading[2].trim()]),
      });
      index += 1;
      continue;
    }
    if (RULE.test(line)) {
      nodes.push({ type: "horizontalRule" });
      index += 1;
      continue;
    }
    if (TASK.test(line)) {
      const items: JSONContent[] = [];
      let match: RegExpExecArray | null;
      while (index < lines.length && (match = TASK.exec(lines[index]))) {
        items.push({
          type: "taskItem",
          attrs: { checked: match[1] !== " " },
          content: [paragraph([match[2]])],
        });
        index += 1;
      }
      nodes.push({ type: "taskList", content: items });
      continue;
    }
    const list = BULLET.test(line)
      ? { type: "bulletList", pattern: BULLET }
      : ORDERED.test(line)
        ? { type: "orderedList", pattern: ORDERED }
        : null;
    if (list) {
      const items: JSONContent[] = [];
      let match: RegExpExecArray | null;
      while (
        index < lines.length &&
        !TASK.test(lines[index]) &&
        (match = list.pattern.exec(lines[index]))
      ) {
        items.push({ type: "listItem", content: [paragraph([match[1]])] });
        index += 1;
      }
      nodes.push({ type: list.type, content: items });
      continue;
    }
    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      let match: RegExpExecArray | null;
      while (index < lines.length && (match = QUOTE.exec(lines[index]))) {
        quoted.push(match[1]);
        index += 1;
      }
      nodes.push({ type: "blockquote", content: [paragraph(quoted)] });
      continue;
    }
    const text: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !FENCE.test(lines[index]) &&
      !HEADING.test(lines[index]) &&
      !RULE.test(lines[index]) &&
      !BULLET.test(lines[index]) &&
      !ORDERED.test(lines[index]) &&
      !QUOTE.test(lines[index])
    ) {
      text.push(lines[index]);
      index += 1;
    }
    nodes.push(paragraph(text));
  }
  return nodes;
}

/** One paragraph per non-empty line. */
function plainNodes(text: string): JSONContent[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => paragraph([line]));
}

/**
 * Page blocks, in the format the editor saves (`{ json: node }`), for text an
 * external caller sends. Positions are left for the writer to assign.
 */
export function pageBlocksFromText(
  text: string,
  format: PageTextFormat = "markdown",
  createdBy: PageAuthor = PageAuthor.AI
): PageBlockInput[] {
  const content = format === "plain" ? plainNodes(text) : markdownNodes(text);
  if (content.length === 0) return [];
  return pageBlocksFromDocument({ type: "doc", content }).map((block) => ({
    ...block,
    content: JSON.parse(JSON.stringify(block.content)),
    createdBy,
  }));
}
