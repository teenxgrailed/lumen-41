import type { PageBlockInput } from "@/services/pages/page-write-path";
import type { JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";

import { pageBlocksFromDocument } from "@/components/pages/page-document";

import {
  pageEditorExtensions,
  pageEditorSchema,
} from "@/lib/pages/page-editor-schema";

/**
 * Notion's page markdown ("enhanced markdown", see
 * https://developers.notion.com/guides/data-apis/enhanced-markdown) to Needt
 * page blocks.
 *
 * Enhanced markdown is CommonMark plus Notion tags (callouts, toggles,
 * columns, tables, page references, mentions, media, unknown blocks). The
 * tags are resolved first, in two steps: `splitNotionMarkdown` (pure) turns
 * the text into plain-markdown segments and "atoms" (blocks that need a
 * lookup or a download); `buildPageBlocks` resolves the atoms, parses each
 * markdown segment with @tiptap/markdown against the page editor's own
 * extensions, and hands the document to `pageBlocksFromDocument`, the same
 * function the editor saves through.
 *
 * Server and worker only: @tiptap/markdown must not reach a client bundle.
 */

const MAX_DEPTH = 12;

export type NoteCode =
  | "equation"
  | "synced_block"
  | "unsupported_block"
  | "link_unresolved";

export type MediaKind = "image" | "file" | "audio" | "video" | "pdf";

export type AtomSpec =
  | { type: "callout"; text: string; icon: string | null }
  | { type: "toggle"; text: string }
  | { type: "media"; media: MediaKind; url: string; caption: string }
  | { type: "page"; url: string; title: string; database: boolean }
  | { type: "unknown"; url: string; alt: string };

export type Segment =
  | { type: "markdown"; text: string }
  | { type: "atom"; atom: AtomSpec };

export interface SplitContext {
  /** Local `/pages/<id>` href for a Notion URL, or null when not imported. */
  hrefFor(notionUrl: string): string | null;
  note(code: NoteCode, detail?: string): void;
}

/* ---------- small helpers ---------- */

function parseAttrs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of text.matchAll(/([\w-]+)="([^"]*)"/g)) {
    out[match[1]] = match[2].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  }
  return out;
}

const TRAILING_ATTR_LIST = /\s*\{(?:[A-Za-z_-]+="[^"]*"\s*)+\}\s*$/;
const LIST_ITEM = /^(?:[-*+]|\d+[.)])\s/;
const FENCE = /^\s*(`{3,}|~{3,})/;

function dedent(lines: string[]): string[] {
  return lines.map((line) =>
    line.startsWith("\t")
      ? line.slice(1)
      : line.startsWith("    ")
        ? line.slice(4)
        : line
  );
}

/** Text of one markdown line without markers or inline formatting. */
function plainText(line: string): string {
  return line
    .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s*)/, "")
    .replace(TRAILING_ATTR_LIST, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*~`]/g, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!|<>~$^])/g, "$1")
    .trim();
}

function escapeLinkText(text: string) {
  return text.replace(/([[\]])/g, "\\$1");
}

function dateText(attrs: Record<string, string>): string {
  const start = [attrs.start, attrs.startTime].filter(Boolean).join(" ");
  const end = [attrs.end, attrs.endTime].filter(Boolean).join(" ");
  return end ? `${start} → ${end}` : start;
}

/* ---------- inline tags ---------- */

const MENTION =
  /<(mention-(?:user|page|database|data-source|agent))\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
const MENTION_DATE = /<mention-date\b([^>]*?)\/?>/g;
const SPAN = /<span\b[^>]*>([\s\S]*?)<\/span>/g;
const BREAK = /<br\s*\/?>/gi;
const INLINE_MATH = /(?<![\\$])\$([^$\n]+?)(?<!\\)\$(?!\$)/g;

/** Resolves the inline Notion tags of a markdown line (outside code spans). */
function inlineConvert(
  line: string,
  ctx: SplitContext,
  options: { inTable?: boolean } = {}
): string {
  return line
    .split(/(`[^`\n]*`)/)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part
        .replace(MENTION, (_all, tag: string, attrText: string, body) => {
          const attrs = parseAttrs(attrText);
          const label = String(body ?? "").trim();
          if (tag === "mention-user" || tag === "mention-agent") {
            return `@${label || "someone"}`;
          }
          const title = label || "Untitled";
          const href = attrs.url ? ctx.hrefFor(attrs.url) : null;
          if (href) return `[${escapeLinkText(title)}](${href})`;
          if (attrs.url && /^https?:\/\//.test(attrs.url)) {
            ctx.note("link_unresolved", title);
            return `[${escapeLinkText(title)}](${attrs.url})`;
          }
          return title;
        })
        .replace(MENTION_DATE, (_all, attrText: string) =>
          dateText(parseAttrs(attrText))
        )
        .replace(SPAN, "$1")
        .replace(BREAK, options.inTable ? " " : "  \n")
        .replace(INLINE_MATH, (_all, expression: string) => {
          ctx.note("equation");
          return `\`${expression.trim()}\``;
        });
    })
    .join("");
}

/* ---------- tables ---------- */

function tableToMarkdown(bodyLines: string[], ctx: SplitContext): string {
  const body = bodyLines.join("\n");
  const rows: string[][] = [];
  for (const row of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells: string[] = [];
    for (const cell of row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)) {
      cells.push(
        inlineConvert(cell[1].replace(/\s*\n\s*/g, " ").trim(), ctx, {
          inTable: true,
        }).replace(/\|/g, "\\|")
      );
    }
    rows.push(cells);
  }
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (rows.length === 0 || width === 0) return "";
  const line = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_v, i) => cells[i] ?? "").join(" | ")} |`;
  return [
    line(rows[0]),
    line(Array.from({ length: width }, () => "---")),
    ...rows.slice(1).map(line),
  ].join("\n");
}

/* ---------- block splitter ---------- */

const CONTAINER_OPEN =
  /^<(callout|details|columns|column|table|synced_block|synced_block_reference)\b([^>]*)>(.*)$/;
const PAGE_TAG =
  /^<(page|database)\b([^>]*)>([\s\S]*?)<\/\1>\s*(?:\{[^}]*\})?\s*$/;
const MEDIA_TAG = /^<(audio|video|file|pdf)\b([^>]*)>([\s\S]*?)<\/\1>\s*$/;
const UNKNOWN_TAG = /^<unknown\b([^>]*?)\/?>\s*$/;
const DROPPED_TAG = /^<(?:table_of_contents|empty-block)\b[^>]*\/?>\s*$/;
const UNSUPPORTED_TAG = /^<(custom-block|meeting-notes)\b/;
const IMAGE_LINE =
  /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*(?:\{[^}]*\})?\s*$/;

function convertLines(
  lines: string[],
  ctx: SplitContext,
  depth: number
): Segment[] {
  const segments: Segment[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (text) segments.push({ type: "markdown", text });
    buffer = [];
  };
  const atom = (spec: AtomSpec) => {
    flush();
    segments.push({ type: "atom", atom: spec });
  };
  const nested = (body: string[]) => {
    flush();
    segments.push(...convertLines(dedent(body), ctx, depth + 1));
  };

  if (depth > MAX_DEPTH) {
    return [{ type: "markdown", text: lines.join("\n") }];
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code is literal.
    const fence = FENCE.exec(line);
    if (fence) {
      buffer.push(line);
      i += 1;
      while (i < lines.length) {
        buffer.push(lines[i]);
        const closes =
          FENCE.exec(lines[i])?.[1][0] === fence[1][0] &&
          (FENCE.exec(lines[i]) as RegExpExecArray)[1].length >=
            fence[1].length;
        i += 1;
        if (closes) break;
      }
      buffer.push("");
      continue;
    }

    // Block equation: $$ ... $$ becomes a code block.
    if (line.trim() === "$$") {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && lines[i].trim() !== "$$") {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      ctx.note("equation");
      buffer.push("```latex", ...body, "```", "");
      continue;
    }

    const container = CONTAINER_OPEN.exec(line);
    if (container) {
      const [, name, attrText, tail] = container;
      const closer = `</${name}>`;
      let body: string[];
      const sameLine = tail.endsWith(closer);
      if (sameLine) {
        body =
          tail.length > closer.length ? [tail.slice(0, -closer.length)] : [];
        i += 1;
      } else {
        body = tail.trim() ? [tail] : [];
        i += 1;
        let closed = false;
        while (i < lines.length) {
          if (lines[i].trimEnd() === closer) {
            closed = true;
            i += 1;
            break;
          }
          body.push(lines[i]);
          i += 1;
        }
        if (!closed) ctx.note("unsupported_block", `unclosed <${name}>`);
      }
      const attrs = parseAttrs(attrText);

      if (name === "table") {
        flush();
        const markdown = tableToMarkdown(body, ctx);
        if (markdown) segments.push({ type: "markdown", text: markdown });
      } else if (name === "callout") {
        const inner = dedent(body);
        const first = inner.findIndex((l) => l.trim() !== "");
        const text =
          first === -1 ? "" : plainText(inlineConvert(inner[first], ctx));
        atom({ type: "callout", text, icon: attrs.icon ?? null });
        if (first !== -1 && first + 1 < inner.length) {
          segments.push(
            ...convertLines(inner.slice(first + 1), ctx, depth + 1)
          );
        }
      } else if (name === "details") {
        const inner = dedent(body);
        const first = inner.findIndex((l) => l.trim() !== "");
        let title = "";
        let rest = inner;
        if (first !== -1) {
          const summary = /^<summary>([\s\S]*?)<\/summary>\s*$/.exec(
            inner[first].trim()
          );
          if (summary) {
            title = plainText(inlineConvert(summary[1], ctx));
            rest = inner.slice(first + 1);
          }
        }
        atom({ type: "toggle", text: title });
        segments.push(...convertLines(rest, ctx, depth + 1));
      } else {
        if (name.startsWith("synced_block")) ctx.note("synced_block");
        // columns, column, synced blocks: the children in reading order.
        nested(body);
      }
      continue;
    }

    const trimmed = line.trim();
    const pageTag = PAGE_TAG.exec(trimmed);
    if (pageTag && !line.startsWith("\t")) {
      const attrs = parseAttrs(pageTag[2]);
      atom({
        type: "page",
        url: attrs.url ?? "",
        title: plainText(pageTag[3]) || "Untitled",
        database: pageTag[1] === "database",
      });
      i += 1;
      continue;
    }
    const mediaTag = MEDIA_TAG.exec(trimmed);
    if (mediaTag && !line.startsWith("\t")) {
      const attrs = parseAttrs(mediaTag[2]);
      atom({
        type: "media",
        media: mediaTag[1] as MediaKind,
        url: attrs.src ?? "",
        caption: plainText(mediaTag[3]),
      });
      i += 1;
      continue;
    }
    const unknownTag = UNKNOWN_TAG.exec(trimmed);
    if (unknownTag && !line.startsWith("\t")) {
      const attrs = parseAttrs(unknownTag[1]);
      atom({ type: "unknown", url: attrs.url ?? "", alt: attrs.alt ?? "" });
      i += 1;
      continue;
    }
    if (DROPPED_TAG.test(trimmed)) {
      i += 1;
      continue;
    }
    const unsupported = UNSUPPORTED_TAG.exec(trimmed);
    if (unsupported) {
      ctx.note("unsupported_block", unsupported[1]);
      i += 1;
      continue;
    }
    const image = IMAGE_LINE.exec(trimmed);
    if (image && !line.startsWith("\t")) {
      atom({ type: "media", media: "image", url: image[2], caption: image[1] });
      i += 1;
      continue;
    }

    const cleaned = inlineConvert(line.replace(TRAILING_ATTR_LIST, ""), ctx);
    buffer.push(cleaned);
    i += 1;

    // A paragraph, heading or quote with tab-indented lines under it has
    // children; markdown would read them as code, so they become siblings.
    if (trimmed && !line.startsWith("\t") && !LIST_ITEM.test(line)) {
      const children: string[] = [];
      let j = i;
      while (j < lines.length) {
        if (lines[j].startsWith("\t")) {
          children.push(lines[j]);
          j += 1;
        } else if (
          lines[j].trim() === "" &&
          lines
            .slice(j)
            .find((l) => l.trim() !== "")
            ?.startsWith("\t")
        ) {
          children.push("");
          j += 1;
        } else break;
      }
      if (children.length > 0) {
        buffer.push("");
        nested(children);
        i = j;
      }
    }
  }

  flush();
  return segments;
}

export function splitNotionMarkdown(
  markdown: string,
  ctx: SplitContext
): Segment[] {
  return convertLines(markdown.replace(/\r\n?/g, "\n").split("\n"), ctx, 0);
}

/* ---------- document ---------- */

export type FileRef = {
  url: string;
  name: string;
  assetId?: string;
  mimeType?: string;
};

export type UnknownRef =
  | { kind: "bookmark" | "link"; url: string; title: string }
  | { kind: "skip" };

export interface BuildDeps extends SplitContext {
  /** The local page a Notion URL names, for a page reference block. */
  pageFor(notionUrl: string): { localId: string; title: string } | null;
  resolveFile(spec: {
    media: MediaKind;
    url: string;
    caption: string;
  }): Promise<FileRef>;
  resolveUnknown(spec: { url: string; alt: string }): Promise<UnknownRef>;
}

let manager: MarkdownManager | null = null;

export function parseMarkdown(text: string): JSONContent[] {
  manager ??= new MarkdownManager({
    extensions: pageEditorExtensions as never,
  });
  return manager.parse(text).content ?? [];
}

function special(kind: string, data: Record<string, unknown>): JSONContent {
  return {
    type: "needtPageBlock",
    attrs: { kind, data: JSON.stringify(data) },
  };
}

function paragraph(text: string): JSONContent {
  return {
    type: "paragraph",
    ...(text ? { content: [{ type: "text", text }] } : {}),
  };
}

/** A node the editor schema accepts, else a plain paragraph of its text. */
function validated(node: JSONContent): JSONContent {
  try {
    pageEditorSchema.nodeFromJSON(node).check();
    return node;
  } catch {
    const text = (function collect(n: JSONContent): string {
      return n.text ?? (n.content ?? []).map(collect).join(" ");
    })(node);
    return paragraph(text.trim());
  }
}

async function atomNodes(
  atom: AtomSpec,
  deps: BuildDeps
): Promise<JSONContent[]> {
  switch (atom.type) {
    case "callout":
      return [special("CALLOUT", { text: atom.text, icon: atom.icon })];
    case "toggle":
      return [special("TOGGLE", { text: atom.text })];
    case "page": {
      const target = deps.pageFor(atom.url);
      if (target) {
        return [
          special("PAGE_MENTION", {
            pageId: target.localId,
            title: atom.title || target.title,
            url: `/pages/${target.localId}`,
          }),
        ];
      }
      deps.note("link_unresolved", atom.title);
      return atom.url
        ? [special("LINK", { url: atom.url, title: atom.title })]
        : [paragraph(atom.title)];
    }
    case "media": {
      const file = await deps.resolveFile({
        media: atom.media,
        url: atom.url,
        caption: atom.caption,
      });
      const data = {
        url: file.url,
        name: atom.caption || file.name,
        ...(file.assetId ? { assetId: file.assetId } : {}),
        ...(file.mimeType ? { mimeType: file.mimeType } : {}),
      };
      return [special(atom.media === "image" ? "IMAGE" : "FILE", data)];
    }
    case "unknown": {
      const resolved = await deps.resolveUnknown({
        url: atom.url,
        alt: atom.alt,
      });
      if (resolved.kind === "skip") return [];
      return [
        special(resolved.kind === "bookmark" ? "BOOKMARK" : "LINK", {
          url: resolved.url,
          title: resolved.title,
        }),
      ];
    }
  }
}

export async function buildPageBlocks(
  segments: Segment[],
  deps: BuildDeps
): Promise<PageBlockInput[]> {
  const nodes: JSONContent[] = [];
  for (const segment of segments) {
    if (segment.type === "markdown") {
      nodes.push(...parseMarkdown(segment.text).map(validated));
    } else {
      nodes.push(...(await atomNodes(segment.atom, deps)));
    }
  }
  if (nodes.length === 0) return [];
  return pageBlocksFromDocument({
    type: "doc",
    content: nodes,
  }) as PageBlockInput[];
}
