/**
 * A parser for the small Markdown subset the legal documents are written in:
 * headings (#, ##, ###), paragraphs, "- " lists, pipe tables, "> " quotes,
 * "---" rules, and inline **bold**, `code` and [links](url).
 *
 * The documents are our own text, so the parser is strict instead of
 * forgiving: anything it does not know is a paragraph, and the tests check the
 * documents parse to what the pages expect.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; id: string; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; items: Inline[][] }
  | { type: "table"; head: Inline[][]; rows: Inline[][][] }
  | { type: "quote"; children: Block[] }
  | { type: "rule" };

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last)
      out.push({ type: "text", value: text.slice(last, index) });
    if (match[1] !== undefined) {
      out.push({ type: "strong", children: parseInline(match[1]) });
    } else if (match[2] !== undefined) {
      out.push({ type: "code", value: match[2] });
    } else {
      out.push({
        type: "link",
        href: match[4] ?? "",
        children: parseInline(match[3] ?? ""),
      });
    }
    last = index + match[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((node) =>
      node.type === "text" || node.type === "code"
        ? node.value
        : inlineText(node.children)
    )
    .join("");
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

const SEPARATOR_ROW = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const children = parseInline(heading[2] ?? "");
      blocks.push({
        type: "heading",
        level: (heading[1] ?? "#").length as 1 | 2 | 3,
        id: slugify(inlineText(children)),
        children,
      });
      i += 1;
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      blocks.push({ type: "rule" });
      i += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const inner: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith(">")) {
        inner.push((lines[i] ?? "").trim().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", children: parseMarkdown(inner.join("\n")) });
      continue;
    }

    if (
      trimmed.startsWith("|") &&
      SEPARATOR_ROW.test((lines[i + 1] ?? "").trim())
    ) {
      const head = splitRow(trimmed).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
        rows.push(splitRow(lines[i] ?? "").map(parseInline));
        i += 1;
      }
      blocks.push({ type: "table", head, rows });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^[-*]\s+/.test((lines[i] ?? "").trim())) {
        items.push(
          parseInline((lines[i] ?? "").trim().replace(/^[-*]\s+/, ""))
        );
        i += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length) {
      const next = (lines[i] ?? "").trim();
      if (
        !next ||
        /^#{1,3}\s/.test(next) ||
        /^-{3,}$/.test(next) ||
        next.startsWith(">") ||
        next.startsWith("|") ||
        /^[-*]\s+/.test(next)
      ) {
        break;
      }
      paragraph.push(next);
      i += 1;
    }
    blocks.push({
      type: "paragraph",
      children: parseInline(paragraph.join(" ")),
    });
  }

  return blocks;
}
