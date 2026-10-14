/**
 * What the document rail's Tasks and Files tabs show, read from the page as
 * drawn (Tasks) and from the page's attachments (Files). Pure, so it is tested
 * apart from the panel.
 */

const HEADINGS = "h1, h2, h3";
const TASK_ITEM = 'li[data-type="taskItem"]';
const TASK_LINK = '[data-needt-page-block="TASK_REFERENCE"]';

/** One line of the Tasks tab. */
export interface DocTaskRow {
  /** A to-do in the text (can be ticked here), or a task the page links to. */
  kind: "item" | "link";
  text: string;
  done: boolean;
  /** The headings it sits under, outermost first ("Scope", "What ships"). */
  where: string[];
  /** For a link: where the task opens. */
  href: string | null;
  /** Position among the page's to-dos (`item` only); ticking and scrolling use it. */
  nth: number;
}

const clean = (s: string | null | undefined) =>
  (s ?? "").replace(/\s+/g, " ").trim();

/** The text of a to-do: its own first paragraph, not the to-dos nested in it. */
function itemText(li: Element) {
  const body = li.querySelector(":scope > div");
  const own = body?.querySelector(":scope > p") ?? body;
  return clean(own?.textContent);
}

/**
 * The tasks a page holds, in reading order: every to-do in its text (checked
 * or not) and every task it links to, each with the headings above it. The
 * rail calls this again whenever the text changes.
 */
export function tasksOf(editor: ParentNode | null): DocTaskRow[] {
  if (!editor) return [];
  const rows: DocTaskRow[] = [];
  const trail: { depth: number; text: string }[] = [];
  let nth = -1;
  for (const el of Array.from(
    editor.querySelectorAll(`${HEADINGS}, ${TASK_ITEM}, ${TASK_LINK}`)
  )) {
    if (el.matches(HEADINGS)) {
      const depth = Number(el.tagName.slice(1));
      while (trail.length && trail[trail.length - 1].depth >= depth)
        trail.pop();
      const text = clean(el.textContent);
      if (text) trail.push({ depth, text });
      continue;
    }
    const where = trail.map((t) => t.text);
    if (el.matches(TASK_ITEM)) {
      nth += 1;
      const text = itemText(el);
      if (!text) continue;
      rows.push({
        kind: "item",
        text,
        done: el.getAttribute("data-checked") === "true",
        where,
        href: null,
        nth,
      });
    } else {
      // A reference with no address yet draws as a label, not a link: skip it.
      const link = el.querySelector("a");
      const text = clean(link?.textContent);
      if (!link || !text) continue;
      rows.push({
        kind: "link",
        text,
        done: false,
        where,
        href: link.getAttribute("href"),
        nth: -1,
      });
    }
  }
  return rows;
}

/** The nth to-do's element in the page, for ticking it or scrolling to it. */
export const taskItemAt = (editor: ParentNode | null, nth: number) =>
  editor?.querySelectorAll(TASK_ITEM)[nth] ?? null;

/** "Scope › What ships"; a linked task on a page without headings says "Task". */
export const whereLabel = (row: Pick<DocTaskRow, "where" | "kind">) =>
  row.where.length ? row.where.join(" › ") : row.kind === "link" ? "Task" : "";

/* ---------- files ---------- */

const KIND_OF_EXT: Record<string, string> = {
  pdf: "PDF",
  csv: "CSV",
  doc: "Word",
  docx: "Word",
  xls: "Excel",
  xlsx: "Excel",
  ppt: "Slides",
  pptx: "Slides",
  key: "Slides",
  txt: "Text",
  md: "Text",
  zip: "Archive",
  json: "JSON",
};

/** "PDF", "Image", "CSV": a short name for a file's kind. */
export function fileKind(name: string, mimeType: string) {
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (KIND_OF_EXT[ext]) return KIND_OF_EXT[ext];
  if (mimeType === "application/pdf") return "PDF";
  return ext && ext.length <= 4 ? ext.toUpperCase() : "File";
}

/** "240 KB", "1.4 MB", "812 B". */
export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

/** The second line of a file row: "PDF · 240 KB". */
export const fileMeta = (f: { name: string; mimeType: string; size: number }) =>
  `${fileKind(f.name, f.mimeType)} · ${fileSize(f.size)}`;

/** Pictures go in the Media grid, everything else in the Files list. */
export const isMedia = (f: { mimeType: string }) =>
  f.mimeType.startsWith("image/") && f.mimeType !== "image/svg+xml";
