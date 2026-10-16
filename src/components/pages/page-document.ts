import type { PageBlockType } from "@prisma/client";
import type { JSONContent } from "@tiptap/react";

import { randomId } from "@/lib/uuid";

import type { PageBlock } from "./page-types";

const NODE_TO_BLOCK: Record<string, PageBlockType> = {
  paragraph: "PARAGRAPH",
  bulletList: "BULLETED_LIST",
  orderedList: "NUMBERED_LIST",
  taskList: "CHECKLIST",
  blockquote: "QUOTE",
  codeBlock: "CODE",
  horizontalRule: "DIVIDER",
  image: "IMAGE",
  table: "TABLE",
};

export function blockTypeForNode(node: JSONContent): PageBlockType {
  if (node.type === "heading") {
    const level = Number(node.attrs?.level);
    return `HEADING_${Math.max(1, Math.min(3, level || 1))}` as PageBlockType;
  }
  if (node.type === "needtPageBlock") {
    const kind =
      typeof node.attrs?.kind === "string" ? node.attrs.kind : "CALLOUT";
    return kind === "TASK_REFERENCE" || kind === "PROJECT_REFERENCE"
      ? "LINK"
      : (kind as PageBlockType);
  }
  return NODE_TO_BLOCK[node.type || ""] || "PARAGRAPH";
}

export function documentFromPageBlocks(
  blocks: PageBlock[]
): JSONContent | null {
  const content = blocks
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((block) => {
      if (
        block.content &&
        typeof block.content === "object" &&
        "json" in block.content
      ) {
        const json = (block.content as { json?: unknown }).json;
        if (json && typeof json === "object") {
          const node = structuredClone(json) as JSONContent;
          node.attrs = { ...(node.attrs || {}), blockId: block.id };
          return node;
        }
      }
      if (
        block.content &&
        typeof block.content === "object" &&
        "text" in block.content &&
        typeof (block.content as { text?: unknown }).text === "string"
      ) {
        const text = (block.content as { text: string }).text;
        return {
          type: "paragraph",
          attrs: { blockId: block.id },
          content: text ? [{ type: "text", text }] : undefined,
        } satisfies JSONContent;
      }
      return null;
    })
    .filter((node): node is JSONContent => Boolean(node));

  return content.length > 0 ? { type: "doc", content } : null;
}

export function legacyPageHtml(blocks: PageBlock[]) {
  const html = blocks
    .map((block) => {
      if (!block.content || typeof block.content !== "object") return "";
      const candidate = block.content as { html?: unknown };
      return typeof candidate.html === "string" ? candidate.html : "";
    })
    .filter(Boolean)
    .join("");
  return html || "<p></p>";
}

export function pageBlocksFromDocument(document: JSONContent) {
  const seen = new Set<string>();
  return (document.content || []).map((node, index) => {
    const candidate =
      typeof node.attrs?.blockId === "string" ? node.attrs.blockId : "";
    const id = candidate && !seen.has(candidate) ? candidate : randomId();
    seen.add(id);
    const normalizedNode = structuredClone(node);
    normalizedNode.attrs = { ...(normalizedNode.attrs || {}), blockId: id };
    return {
      id,
      parentBlockId: null,
      type: blockTypeForNode(normalizedNode),
      content: { json: normalizedNode },
      position: (index + 1) * 1024,
    };
  });
}
