/**
 * The short preview a document card draws in miniature (Docs grid). A pure
 * reduction of a page's first top-level blocks to a handful of plain rows:
 * `{ type, text }`, never HTML and never markup the author controls. The
 * list route reads the blocks with one query (`page-preview-service.ts`) and
 * hands them here; nothing in this file touches the database.
 *
 * Sizes are capped on purpose: a row is at most `PREVIEW_ROW_TEXT`
 * characters, the whole preview at most `PREVIEW_TOTAL_TEXT` and
 * `PREVIEW_MAX_ROWS` rows, so the list response grows by a bounded, small
 * amount per page whatever the page holds.
 */

/** Rows the miniature can draw. Everything else is left out. */
export type PagePreviewType =
  | "h1"
  | "h2"
  | "h3"
  | "p"
  | "lead"
  | "li"
  | "ol"
  | "todo"
  | "quote"
  | "callout"
  | "code"
  | "rule"
  | "image";

export interface PagePreviewBlock {
  type: PagePreviewType;
  /** Plain text, already clipped and cleaned. "" for `rule` and `image`. */
  text: string;
  /** A ticked to-do. Only ever present (and `true`) on `todo`. */
  checked?: true;
}

/** A top-level block as the list query reads it. */
export interface PreviewSourceBlock {
  /** The `PageBlock.type` column, as text. */
  type: string;
  /** The stored `PageBlock.content`; null when it was too large to read. */
  content: unknown;
  /** The first text found in a block too large to read whole. */
  firstText?: string | null;
}

export const PREVIEW_MAX_ROWS = 8;
export const PREVIEW_ROW_TEXT = 120;
export const PREVIEW_TOTAL_TEXT = 600;
/** Code keeps its line breaks, a few of them. */
const PREVIEW_CODE_LINES = 3;
/** Stop walking a node tree once this much raw text is gathered. */
const GATHER_LIMIT = 2_000;
const MAX_DEPTH = 8;
const MAX_LIST_ITEMS = 8;

const HEADINGS: Record<string, PagePreviewType> = {
  HEADING_1: "h1",
  HEADING_2: "h2",
  HEADING_3: "h3",
};

/** `PageBlock.type` to the row it draws as when the content has no node. */
const COLUMN_TYPE: Record<string, PagePreviewType> = {
  ...HEADINGS,
  PARAGRAPH: "p",
  LEAD: "lead",
  BULLETED_LIST: "li",
  NUMBERED_LIST: "ol",
  CHECKLIST: "todo",
  QUOTE: "quote",
  CALLOUT: "callout",
  CODE: "code",
  DIVIDER: "rule",
  IMAGE: "image",
  TOGGLE: "p",
};

/** Special blocks (`needtPageBlock` `kind`) that draw as text rows. */
const KIND_TEXT: Record<string, PagePreviewType> = {
  CALLOUT: "callout",
  LEAD: "lead",
  TOGGLE: "p",
  LINK: "p",
  BOOKMARK: "p",
  PAGE_MENTION: "p",
  DATE_MENTION: "p",
};

const BIDI_AND_ZERO_WIDTH =
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Clip at a code-point boundary with an ellipsis. */
function clip(text: string, max: number) {
  if (text.length <= max) return text;
  let end = Math.max(0, max - 1);
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1; // never cut a pair in two
  return `${text.slice(0, end).trimEnd()}…`;
}

/**
 * Plain, single-line text: control characters, direction overrides and
 * zero-width marks removed, whitespace collapsed.
 */
export function cleanLine(raw: string) {
  return raw
    .replace(/\p{Cc}/gu, " ")
    .replace(BIDI_AND_ZERO_WIDTH, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Plain code: line breaks kept (a few lines), every other control removed. */
function cleanCode(raw: string) {
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/\p{Cc}/gu, " ")
        .replace(BIDI_AND_ZERO_WIDTH, "")
        .trimEnd()
    );
  while (lines.length && lines[0].trim() === "") lines.shift();
  return lines.slice(0, PREVIEW_CODE_LINES).join("\n").trimEnd();
}

/** The text under a node, joined in reading order. Bounded. */
function gather(node: unknown, depth = 0, out: string[] = [], size = { n: 0 }) {
  if (size.n >= GATHER_LIMIT || depth > MAX_DEPTH || !isObject(node)) {
    return out;
  }
  if (node.type === "text" && typeof node.text === "string") {
    out.push(node.text);
    size.n += node.text.length;
    return out;
  }
  if (node.type === "hardBreak") {
    out.push(" ");
    return out;
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      gather(child, depth + 1, out, size);
      // Separate the paragraphs of a quote or a list item.
      if (isObject(child) && child.type !== "text") out.push(" ");
    }
  }
  return out;
}

const textOf = (node: unknown) => cleanLine(gather(node).join(""));

function row(
  type: PagePreviewType,
  text: string,
  checked?: boolean
): PagePreviewBlock {
  const out: PagePreviewBlock = { type, text };
  if (type === "todo" && checked) out.checked = true;
  return out;
}

/** The rows of a list node (bullet, numbered or task), one per item. */
function listRows(node: Record<string, unknown>, depth = 0) {
  const rows: PagePreviewBlock[] = [];
  const items = Array.isArray(node.content) ? node.content : [];
  const kind: PagePreviewType =
    node.type === "orderedList"
      ? "ol"
      : node.type === "taskList"
        ? "todo"
        : "li";
  for (const item of items.slice(0, MAX_LIST_ITEMS)) {
    if (!isObject(item)) continue;
    const own = Array.isArray(item.content)
      ? item.content.filter(
          (child) =>
            !(
              isObject(child) &&
              (child.type === "bulletList" ||
                child.type === "orderedList" ||
                child.type === "taskList")
            )
        )
      : [];
    const text = cleanLine(own.map((child) => textOf(child)).join(" "));
    const checked = isObject(item.attrs) && item.attrs.checked === true;
    if (text) rows.push(row(kind, text, checked));
    if (depth < 1 && Array.isArray(item.content)) {
      for (const child of item.content) {
        if (
          isObject(child) &&
          (child.type === "bulletList" ||
            child.type === "orderedList" ||
            child.type === "taskList")
        ) {
          rows.push(...listRows(child, depth + 1));
        }
      }
    }
  }
  return rows;
}

function specialData(node: Record<string, unknown>) {
  const raw = isObject(node.attrs) ? node.attrs.data : null;
  if (typeof raw !== "string" || raw.length > 4_000) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function specialRows(node: Record<string, unknown>): PagePreviewBlock[] {
  const kind =
    isObject(node.attrs) && typeof node.attrs.kind === "string"
      ? node.attrs.kind
      : "CALLOUT";
  if (kind === "IMAGE") return [row("image", "")];
  if (kind === "DIVIDER") return [row("rule", "")];
  const type = KIND_TEXT[kind];
  if (!type) return [];
  const data = specialData(node);
  const pick = (key: string) =>
    typeof data[key] === "string" ? (data[key] as string) : "";
  const text = cleanLine(
    pick("text") || pick("title") || pick("name") || pick("date")
  );
  return text ? [row(type, text)] : [];
}

function tableRows(node: Record<string, unknown>): PagePreviewBlock[] {
  const rows: PagePreviewBlock[] = [];
  const tableRowsIn = Array.isArray(node.content) ? node.content : [];
  for (const tr of tableRowsIn.slice(0, 2)) {
    if (!isObject(tr) || !Array.isArray(tr.content)) continue;
    const cells = tr.content
      .slice(0, 4)
      .map((cell) => textOf(cell))
      .filter(Boolean);
    if (cells.length) rows.push(row("p", cells.join(" · ")));
  }
  return rows;
}

/** The rows one stored tiptap node draws as. */
function nodeRows(node: Record<string, unknown>): PagePreviewBlock[] {
  switch (node.type) {
    case "heading": {
      const level = isObject(node.attrs) ? Number(node.attrs.level) : 1;
      const type = (["h1", "h2", "h3"] as const)[
        Math.max(1, Math.min(3, level || 1)) - 1
      ];
      const text = textOf(node);
      return text ? [row(type, text)] : [];
    }
    case "paragraph": {
      const text = textOf(node);
      return text ? [row("p", text)] : [];
    }
    case "bulletList":
    case "orderedList":
    case "taskList":
      return listRows(node);
    case "blockquote": {
      const text = textOf(node);
      return text ? [row("quote", text)] : [];
    }
    case "codeBlock": {
      const text = cleanCode(gather(node).join(""));
      return text ? [row("code", text)] : [];
    }
    case "horizontalRule":
      return [row("rule", "")];
    case "image":
      return [row("image", "")];
    case "table":
      return tableRows(node);
    case "needtPageBlock":
      return specialRows(node);
    case "needtCallout": {
      const text = textOf(node);
      return text ? [row("callout", text)] : [];
    }
    case "needtToggle": {
      // The title is what shows when the toggle is folded.
      const title = Array.isArray(node.content) ? node.content[0] : null;
      const text = textOf(title);
      return text ? [row("p", text)] : [];
    }
    case "needtColumns": {
      const text = textOf(node);
      return text ? [row("p", text)] : [];
    }
    default:
      return [];
  }
}

/** Legacy `{ html }` content: its words, markup dropped. */
function htmlText(html: string) {
  return cleanLine(
    html
      .slice(0, 8_000)
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
  );
}

function blockRows(block: PreviewSourceBlock): PagePreviewBlock[] {
  const content = block.content;
  if (isObject(content) && isObject(content.json)) {
    return nodeRows(content.json);
  }
  const type = COLUMN_TYPE[block.type];
  if (!type) return [];
  if (type === "rule" || type === "image") return [row(type, "")];
  let text = "";
  if (isObject(content) && typeof content.text === "string") {
    text = content.text;
  } else if (isObject(content) && typeof content.html === "string") {
    text = htmlText(content.html);
  } else if (typeof block.firstText === "string") {
    text = block.firstText;
  }
  const clean = type === "code" ? cleanCode(text) : cleanLine(text);
  return clean ? [row(type, clean)] : [];
}

/**
 * The preview of a page from its first top-level blocks, in order. Empty
 * for an empty page.
 */
export function buildPagePreview(
  blocks: readonly PreviewSourceBlock[]
): PagePreviewBlock[] {
  const out: PagePreviewBlock[] = [];
  let budget = PREVIEW_TOTAL_TEXT;
  for (const block of blocks) {
    for (const candidate of blockRows(block)) {
      if (out.length >= PREVIEW_MAX_ROWS || budget <= 0) return out;
      const limit = Math.min(PREVIEW_ROW_TEXT, budget);
      const text = clip(candidate.text, limit);
      budget -= text.length;
      out.push({ ...candidate, text });
    }
    if (out.length >= PREVIEW_MAX_ROWS || budget <= 0) break;
  }
  return out;
}
