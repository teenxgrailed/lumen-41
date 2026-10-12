import DOMPurify from "isomorphic-dompurify";

import { RICH_TEXT_DESCRIPTION_PREFIX } from "./task-description-prefix";

export { RICH_TEXT_DESCRIPTION_PREFIX };

const ALLOWED_TAGS = [
  "a",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "img",
  "input",
  "label",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "u",
  "ul",
];

const ALLOWED_ATTR = [
  "alt",
  "checked",
  "class",
  "data-checked",
  "data-type",
  "disabled",
  "href",
  "rel",
  "src",
  "target",
  "title",
  "type",
];

function sanitizeHtml(value: string): string {
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderLegacyInlineMarkdown(value: string): string {
  return value
    .replace(
      /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g,
      '<img alt="$1" src="$2">'
    )
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
    .replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, "<u>$1</u>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

/**
 * Converts descriptions created before the rich-text editor into safe HTML.
 * Plain text remains plain-looking; the small Markdown subset previously
 * inserted by TaskModal is rendered instead of exposed to the user.
 */
export function legacyTaskDescriptionToHtml(value: string): string {
  const escaped = escapeHtml(value.trim());
  if (!escaped) return "";

  const lines = escaped.split(/\r?\n/);
  const output: string[] = [];
  let listType: "ul" | "ol" | "task" | null = null;

  const closeList = () => {
    if (listType) output.push(listType === "ol" ? "</ol>" : "</ul>");
    listType = null;
  };

  for (const line of lines) {
    const taskMatch = line.match(/^- \[([ xX])\] (.*)$/);
    const bulletMatch = line.match(/^- (.*)$/);
    const orderedMatch = line.match(/^\d+\. (.*)$/);

    if (taskMatch) {
      if (listType !== "task") {
        closeList();
        output.push('<ul data-type="taskList">');
        listType = "task";
      }
      output.push(
        `<li data-checked="${taskMatch[1].toLowerCase() === "x"}"><p>${renderLegacyInlineMarkdown(taskMatch[2])}</p></li>`
      );
      continue;
    }

    if (bulletMatch) {
      if (listType !== "ul") {
        closeList();
        output.push("<ul>");
        listType = "ul";
      }
      output.push(`<li>${renderLegacyInlineMarkdown(bulletMatch[1])}</li>`);
      continue;
    }

    if (orderedMatch) {
      if (listType !== "ol") {
        closeList();
        output.push("<ol>");
        listType = "ol";
      }
      output.push(`<li>${renderLegacyInlineMarkdown(orderedMatch[1])}</li>`);
      continue;
    }

    closeList();
    if (line.startsWith("## ")) {
      output.push(`<h2>${renderLegacyInlineMarkdown(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      output.push(`<h1>${renderLegacyInlineMarkdown(line.slice(2))}</h1>`);
    } else if (!line) {
      output.push("<p></p>");
    } else {
      output.push(`<p>${renderLegacyInlineMarkdown(line)}</p>`);
    }
  }

  closeList();
  return sanitizeHtml(output.join(""));
}

export function isRichTaskDescription(value: string | null | undefined) {
  return Boolean(value?.startsWith(RICH_TEXT_DESCRIPTION_PREFIX));
}

export function taskDescriptionToHtml(
  value: string | null | undefined
): string {
  if (!value) return "";
  if (!isRichTaskDescription(value)) {
    return legacyTaskDescriptionToHtml(value);
  }
  return sanitizeHtml(value.slice(RICH_TEXT_DESCRIPTION_PREFIX.length));
}

export function serializeTaskDescription(html: string): string {
  const sanitized = sanitizeHtml(html).trim();
  const meaningful = sanitized
    .replace(/<(p|div)><br><\/\1>/g, "")
    .replace(/<br\s*\/?>/g, "")
    .replace(/&nbsp;/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();

  if (!meaningful && !/<(img|input)\b/i.test(sanitized)) return "";
  return `${RICH_TEXT_DESCRIPTION_PREFIX}${sanitized}`;
}

export function sanitizeTaskDescriptionForStorage(
  value: unknown
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!isRichTaskDescription(trimmed)) return trimmed;
  return serializeTaskDescription(
    trimmed.slice(RICH_TEXT_DESCRIPTION_PREFIX.length)
  );
}

export function taskDescriptionToPlainText(
  value: string | null | undefined
): string {
  const html = taskDescriptionToHtml(value);
  if (!html) return "";

  return DOMPurify.sanitize(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h1|h2|li|blockquote)>/gi, "\n"),
    { ALLOWED_TAGS: [] }
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
