/**
 * The templates that come with Needt (places.jsx `TEMPLATES`): six starting
 * pages, defined here because they belong to the product, not to a person's
 * account, so no database row stands behind them. "Use" makes a real page from
 * one through the same two routes any client has (`POST /api/pages`, then
 * `PUT /api/pages/:id/blocks`); the saved templates a person makes from a page
 * stay on `/api/page-templates`.
 *
 * Pure: no React, no fetch. The page colour is a free one (a backdrop is Pro,
 * and a template must work on every plan).
 */
import type { PagePreviewBlock } from "@/lib/pages/page-preview";

type Entry =
  | ["lead" | "h" | "p" | "li" | "todo" | "callout" | "shot", string]
  | ["table", [string, string][]];

export interface BuiltinTemplate {
  id: string;
  title: string;
  /** What the card says under the title. */
  meta: string;
  /** The page's `style` when it is made. */
  style: { backdrop: "none"; page: string; text: "auto"; font: "sans" };
  body: Entry[];
}

const page = (name: string): BuiltinTemplate["style"] => ({
  backdrop: "none",
  page: name,
  text: "auto",
  font: "sans",
});

const SPEC: Omit<BuiltinTemplate, "meta">[] = [
  {
    id: "builtin:daily",
    title: "Daily note",
    style: page("sky"),
    body: [
      ["lead", "What would make today a good day?"],
      ["h", "Plan"],
      ["todo", "First task"],
      ["todo", "Second task"],
      ["h", "Notes"],
      ["p", "Write as you go."],
    ],
  },
  {
    id: "builtin:review",
    title: "Weekly review",
    style: page("sage"),
    body: [
      ["h", "Went well"],
      ["li", "…"],
      ["h", "Didn't"],
      ["li", "…"],
      ["h", "Next week"],
      ["todo", "One thing that matters"],
    ],
  },
  {
    id: "builtin:drop",
    title: "Product drop",
    style: page("sand"),
    body: [
      ["callout", "Drop date, price, quantity — decide these first."],
      ["h", "Checklist"],
      ["todo", "Samples approved"],
      ["todo", "Photos shot"],
      ["todo", "Listing written"],
      ["shot", "The hero shot goes here."],
    ],
  },
  {
    id: "builtin:meeting",
    title: "Meeting notes",
    style: page("white"),
    body: [
      ["p", "Who, when, why."],
      ["h", "Decisions"],
      ["li", "…"],
      ["h", "Actions"],
      ["todo", "Owner — task — date"],
    ],
  },
  {
    id: "builtin:listing",
    title: "Resale listing",
    style: page("paper"),
    body: [
      [
        "table",
        [
          ["Brand", "—"],
          ["Size", "—"],
          ["Condition", "—"],
          ["Price", "CHF —"],
        ],
      ],
      ["p", "Measurements and flaws, in that order."],
    ],
  },
  {
    id: "builtin:brief",
    title: "Project brief",
    style: page("sky"),
    body: [
      ["lead", "One sentence: what changes when this ships."],
      ["h", "Scope"],
      ["li", "In"],
      ["li", "Out"],
      ["h", "Open questions"],
      ["todo", "…"],
    ],
  },
];

/** A document node as the editor stores it (the blocks route takes it as is). */
export interface TemplateNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TemplateNode[];
  text?: string;
}

const text = (t: string): TemplateNode[] =>
  t ? [{ type: "text", text: t }] : [];
const para = (t: string): TemplateNode => ({
  type: "paragraph",
  ...(t ? { content: text(t) } : {}),
});
const special = (
  kind: string,
  data: Record<string, unknown>
): TemplateNode => ({
  type: "needtPageBlock",
  attrs: { kind, data: JSON.stringify(data) },
});

/**
 * The body as the editor's top-level nodes. Neighbouring bullets share one
 * list and neighbouring to-dos share one checklist, the way typing them would.
 */
export function nodesOf(body: readonly Entry[]): TemplateNode[] {
  const out: TemplateNode[] = [];
  for (const entry of body) {
    if (entry[0] === "table") {
      out.push({
        type: "table",
        content: entry[1].map((cells, row) => ({
          type: "tableRow",
          content: cells.map((cell) => ({
            type: row === 0 ? "tableHeader" : "tableCell",
            content: [para(cell)],
          })),
        })),
      });
      continue;
    }
    const [kind, value] = entry;
    const last = out[out.length - 1];
    if (kind === "li") {
      const item = { type: "listItem", content: [para(value)] };
      if (last?.type === "bulletList") last.content!.push(item);
      else out.push({ type: "bulletList", content: [item] });
    } else if (kind === "todo") {
      const item = {
        type: "taskItem",
        attrs: { checked: false },
        content: [para(value)],
      };
      if (last?.type === "taskList") last.content!.push(item);
      else out.push({ type: "taskList", content: [item] });
    } else if (kind === "h") {
      out.push({ type: "heading", attrs: { level: 2 }, content: text(value) });
    } else if (kind === "lead") out.push(special("LEAD", { text: value }));
    else if (kind === "callout") out.push(special("CALLOUT", { text: value }));
    else out.push(para(value));
  }
  return out;
}

const BLOCK_OF: Record<string, string> = {
  heading: "HEADING_2",
  bulletList: "BULLETED_LIST",
  taskList: "CHECKLIST",
};

/** The body as the rows `PUT /api/pages/:id/blocks` takes. */
export function blocksOf(body: readonly Entry[]) {
  return nodesOf(body).map((node, i) => ({
    type:
      node.type === "needtPageBlock"
        ? String(node.attrs?.kind)
        : (BLOCK_OF[node.type] ?? "PARAGRAPH"),
    content: { json: node },
    position: (i + 1) * 1024,
  }));
}

/** The first rows of the body, for the card's miniature. */
export function previewOf(body: readonly Entry[]): PagePreviewBlock[] {
  const rows: PagePreviewBlock[] = [];
  for (const entry of body) {
    if (entry[0] === "table")
      rows.push({ type: "p", text: entry[1].map((c) => c[0]).join(" · ") });
    else if (entry[0] === "h") rows.push({ type: "h2", text: entry[1] });
    else if (entry[0] === "shot") rows.push({ type: "image", text: "" });
    else rows.push({ type: entry[0], text: entry[1] });
  }
  return rows.slice(0, 8);
}

/** "Built in · 6 blocks": top-level blocks, as the page will have them. */
const metaOf = (body: readonly Entry[]) => {
  const n = nodesOf(body).length;
  return `Built in · ${n} ${n === 1 ? "block" : "blocks"}`;
};

export const BUILTIN_TEMPLATES: readonly BuiltinTemplate[] = SPEC.map((t) => ({
  ...t,
  meta: metaOf(t.body),
}));

export const builtinTemplate = (id: string) =>
  BUILTIN_TEMPLATES.find((t) => t.id === id);
