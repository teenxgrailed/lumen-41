/**
 * A page as Markdown. Pure: it reads the editor's document JSON, so the editor
 * (current text, unsaved edits included) and the API (the saved blocks) write
 * the same file. Headings, lists, checklists, quotes, code, rules, images,
 * tables and links come out as CommonMark/GFM; what Markdown has no word for is
 * written as the nearest plain thing:
 *
 *   Callout   -> a quote that starts with its icon
 *   Toggle    -> <details><summary>title</summary> body </details>
 *   Columns   -> the columns' blocks one after another
 *   Highlight -> ==text==     Underline -> <u>text</u>
 *   Text colour -> dropped (the words stay)
 *
 * Addresses go through the same allowlist the page draws links with, so an
 * exported file never carries a `javascript:` link that was stored in a page.
 */
import type { JSONContent } from "@tiptap/core";

import { documentFromPageBlocks } from "@/components/pages/page-document";
import type { PageBlock } from "@/components/pages/page-types";

import { upgradeLegacyNode } from "@/lib/pages/legacy-blocks";
import { APP_PATHS, safeUrl } from "@/lib/pages/safe-url";

export interface MarkdownOptions {
  /** Turns an app path (`/pages/…`, uploaded files) into an absolute address. */
  origin?: string;
}

/** Task and project references link outside /pages. */
const LINK_PATHS = [...APP_PATHS, "/tasks", "/projects"];

function address(raw: unknown, origin: string | undefined, image = false) {
  const url = safeUrl(raw, { paths: LINK_PATHS, allowMailto: !image });
  if (!url) return null;
  return origin && url.startsWith("/")
    ? `${origin.replace(/\/$/, "")}${url}`
    : url;
}

/** Escapes what Markdown would read as formatting inside a line of text. */
export function escapeInline(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/([`*_[\]~])/g, "\\$1")
    .replace(/</g, "&lt;");
}

/** A line that would start a block (`# `, `> `, `- `, `1. `) is escaped at its start. */
function escapeBlockStart(line: string): string {
  return line
    .replace(/^(\s*)([#>])/, "$1\\$2")
    .replace(/^(\s*)([-+])(\s)/, "$1\\$2$3")
    .replace(/^(\s*)(\d+)([.)])(\s)/, "$1$2\\$3$4");
}

function backtickFence(text: string) {
  const longest = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((run) => run.length)
  );
  return "`".repeat(longest + 1);
}

function wrapMark(
  text: string,
  mark: NonNullable<JSONContent["marks"]>[number],
  origin?: string
) {
  // Keep the spaces outside the markers: `** a **` is not bold in Markdown.
  const lead = /^\s*/.exec(text)?.[0] ?? "";
  const trail = /\s*$/.exec(text.slice(lead.length))?.[0] ?? "";
  const core = text.slice(lead.length, text.length - trail.length);
  if (!core) return text;
  let out: string;
  switch (mark.type) {
    case "bold":
      out = `**${core}**`;
      break;
    case "italic":
      out = `*${core}*`;
      break;
    case "strike":
      out = `~~${core}~~`;
      break;
    case "underline":
      out = `<u>${core}</u>`;
      break;
    case "highlight":
      out = `==${core}==`;
      break;
    case "link": {
      const href = address(mark.attrs?.href, origin);
      out = href ? `[${core}](${href.replace(/\)/g, "%29")})` : core;
      break;
    }
    default:
      out = core;
  }
  return `${lead}${out}${trail}`;
}

const MARK_ORDER = [
  "code",
  "bold",
  "italic",
  "strike",
  "underline",
  "highlight",
  "link",
];

function inline(nodes: JSONContent[] | undefined, origin?: string): string {
  let out = "";
  for (const node of nodes ?? []) {
    if (node.type === "hardBreak") {
      out += "  \n";
      continue;
    }
    if (node.type !== "text" || typeof node.text !== "string") {
      out += inline(node.content, origin);
      continue;
    }
    const marks = [...(node.marks ?? [])].sort(
      (a, b) =>
        MARK_ORDER.indexOf(a.type ?? "") - MARK_ORDER.indexOf(b.type ?? "")
    );
    const code = marks.find((mark) => mark.type === "code");
    let text: string;
    if (code) {
      const fence = backtickFence(node.text);
      // A backtick at either end needs a space inside the fence.
      const pad = /^`|`$/.test(node.text) ? " " : "";
      text = `${fence}${pad}${node.text}${pad}${fence}`;
    } else {
      text = escapeInline(node.text);
    }
    for (const mark of marks) {
      if (mark.type === "code") continue;
      text = wrapMark(text, mark, origin);
    }
    out += text;
  }
  return out;
}

function specialData(node: JSONContent): Record<string, unknown> {
  const raw = node.attrs?.data;
  if (typeof raw !== "string" || raw.length > 20_000) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

const str = (value: unknown) => (typeof value === "string" ? value : "");

function special(node: JSONContent, origin?: string): string {
  const data = specialData(node);
  const kind = str(node.attrs?.kind);
  const url = address(data.url, origin, kind === "IMAGE");
  const label = str(data.text) || str(data.title) || str(data.name) || "";
  switch (kind) {
    case "IMAGE":
      return url ? `![${escapeInline(label || str(data.name))}](${url})` : "";
    case "DATE_MENTION":
      return escapeInline(str(data.date));
    case "FORM":
      return label ? `*Form: ${escapeInline(label)}*` : "";
    case "LINK":
    case "BOOKMARK":
    case "FILE":
    case "PAGE_MENTION":
    case "TASK_REFERENCE":
    case "PROJECT_REFERENCE":
      return url
        ? `[${escapeInline(label || url)}](${url})`
        : escapeInline(label);
    default:
      return label ? escapeInline(label) : "";
  }
}

/**
 * Prefix every line. A blank line inside the block stays blank (a list item's
 * second paragraph) or carries `blank` (a quote's `>`), so the block does not
 * fall apart into two.
 */
function indent(
  text: string,
  prefix: string,
  firstPrefix = prefix,
  blank = ""
) {
  return text
    .split("\n")
    .map((line, index) =>
      line === "" && index > 0
        ? blank
        : `${index === 0 ? firstPrefix : prefix}${line}`
    )
    .join("\n");
}

function blocks(nodes: JSONContent[] | undefined, origin?: string): string[] {
  const out: string[] = [];
  for (const raw of nodes ?? []) {
    const text = block(raw, origin);
    if (text !== "") out.push(text);
  }
  return out;
}

function listItem(item: JSONContent, marker: string, origin?: string): string {
  const children = blocks(item.content, origin);
  if (children.length === 0) return marker.trimEnd();
  const pad = " ".repeat(marker.length);
  // Nested lists sit directly under the line; other blocks keep a blank line.
  let body = children[0];
  for (let index = 1; index < children.length; index += 1) {
    const nested = /^\s*(?:[-*+]|\d+[.)])\s/.test(children[index]);
    body += (nested ? "\n" : "\n\n") + children[index];
  }
  return indent(body, pad, marker);
}

function table(node: JSONContent, origin?: string): string {
  const rows = (node.content ?? []).map((row) =>
    (row.content ?? []).map((cell) =>
      blocks(cell.content, origin)
        .join("<br>")
        .replace(/\n/g, "<br>")
        .replace(/\|/g, "\\|")
    )
  );
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const pad = (row: string[]) =>
    Array.from({ length: width }, (_, i) => row[i] ?? "");
  const firstIsHeader =
    node.content?.[0]?.content?.every((cell) => cell.type === "tableHeader") ??
    false;
  const header = firstIsHeader ? pad(rows[0]) : pad([]);
  const body = (firstIsHeader ? rows.slice(1) : rows).map(pad);
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [
    line(header),
    line(Array.from({ length: width }, () => "---")),
    ...body.map(line),
  ].join("\n");
}

function block(input: JSONContent, origin?: string): string {
  const node = upgradeLegacyNode(input);
  switch (node.type) {
    case "paragraph":
      return escapeBlockStart(inline(node.content, origin).trimEnd());
    case "heading": {
      const level = Math.max(1, Math.min(6, Number(node.attrs?.level) || 1));
      const text = inline(node.content, origin).trim();
      return text ? `${"#".repeat(level)} ${text}` : "";
    }
    case "bulletList":
      return (node.content ?? [])
        .map((item) => listItem(item, "- ", origin))
        .join("\n");
    case "orderedList": {
      const start = Number(node.attrs?.start) || 1;
      return (node.content ?? [])
        .map((item, index) => listItem(item, `${start + index}. `, origin))
        .join("\n");
    }
    case "taskList":
      return (node.content ?? [])
        .map((item) =>
          listItem(item, item.attrs?.checked ? "- [x] " : "- [ ] ", origin)
        )
        .join("\n");
    case "blockquote": {
      const inner = blocks(node.content, origin).join("\n\n");
      return inner ? indent(inner, "> ", "> ", ">") : "";
    }
    case "codeBlock": {
      const code = (node.content ?? []).map((n) => n.text ?? "").join("");
      const fence =
        backtickFence(code).length >= 3 ? backtickFence(code) : "```";
      const language = str(node.attrs?.language).replace(/[^\w+#.-]/g, "");
      return `${fence}${language}\n${code}\n${fence}`;
    }
    case "horizontalRule":
      return "---";
    case "image": {
      const src = address(node.attrs?.src, origin, true);
      const alt = escapeInline(str(node.attrs?.alt) || str(node.attrs?.title));
      return src ? `![${alt}](${src})` : alt;
    }
    case "table":
      return table(node, origin);
    case "needtCallout": {
      const icon = str(node.attrs?.icon);
      const inner = blocks(node.content, origin).join("\n\n");
      return indent(inner, "> ", icon ? `> ${icon} ` : "> ", ">");
    }
    case "needtToggle": {
      const [title, ...rest] = node.content ?? [];
      const summary = inline(title?.content, origin).trim() || "Toggle";
      const body = blocks(rest, origin).join("\n\n");
      return `<details>\n<summary>${summary}</summary>${body ? `\n\n${body}\n\n` : "\n"}</details>`;
    }
    case "needtColumns":
      return (node.content ?? [])
        .map((column) => blocks(column.content, origin).join("\n\n"))
        .filter(Boolean)
        .join("\n\n");
    case "needtPageBlock":
      return special(node, origin);
    default:
      return inline(node.content, origin);
  }
}

/** The document's blocks as Markdown, blocks separated by a blank line. */
export function documentToMarkdown(
  document: JSONContent,
  options: MarkdownOptions = {}
): string {
  return blocks(document.content, options.origin).join("\n\n");
}

/** A titled document: the title as the first heading, then the blocks, one trailing newline. */
export function titledMarkdown(
  title: string,
  document: JSONContent | null,
  options: MarkdownOptions = {}
): string {
  const body = document ? documentToMarkdown(document, options) : "";
  const trimmed = title.trim();
  const head = trimmed ? `# ${escapeInline(trimmed)}` : "";
  return `${[head, body].filter(Boolean).join("\n\n")}\n`;
}

/** A saved page (its stored blocks) as Markdown. */
export function pageToMarkdown(
  page: { title: string; blocks: PageBlock[] },
  options: MarkdownOptions = {}
): string {
  return titledMarkdown(
    page.title,
    documentFromPageBlocks(page.blocks),
    options
  );
}

/** A file name for the export: the title, safe on every file system. */
export function exportFileName(title: string, extension: string): string {
  const base = title
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "page"}.${extension}`;
}
