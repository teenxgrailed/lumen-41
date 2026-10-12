import { Node, mergeAttributes } from "@tiptap/core";

import { APP_PATHS, safeUrl } from "@/lib/pages/safe-url";

const LABELS: Record<string, string> = {
  CALLOUT: "Callout",
  TOGGLE: "Toggle",
  LINK: "Link",
  BOOKMARK: "Bookmark",
  FILE: "File",
  TABLE: "Table",
  COLUMNS: "Columns",
  PAGE_MENTION: "Page mention",
  DATE_MENTION: "Date mention",
  FORM: "Form",
  TASK_REFERENCE: "Task",
  PROJECT_REFERENCE: "Project",
};

/** Task and project references link into the app outside /pages. */
const BLOCK_PATHS = [...APP_PATHS, "/tasks", "/projects"];

export const PageBlockNode = Node.create({
  name: "needtPageBlock",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      blockId: { default: null },
      kind: { default: "CALLOUT" },
      data: { default: "{}" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-needt-page-block]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    let detail = "";
    let url = "";
    let name = "";
    try {
      const data = JSON.parse(String(node.attrs.data)) as {
        text?: string;
        url?: string;
        date?: string;
        title?: string;
        name?: string;
      };
      // Stored attrs are untrusted (imports, API writes): the address is only
      // drawn as an href / src when it passes the shared allowlist.
      url =
        safeUrl(data.url, {
          paths: BLOCK_PATHS,
          allowMailto: String(node.attrs.kind) !== "IMAGE",
        }) ?? "";
      name = data.name || "";
      detail = data.text || data.title || name || data.url || data.date || "";
    } catch {
      detail = "";
    }
    const kind = String(node.attrs.kind);
    const attributes = mergeAttributes(HTMLAttributes, {
      "data-needt-page-block": kind,
      class: `needt-page-special-block needt-page-special-block--${kind.toLowerCase()}`,
    });
    if (kind === "IMAGE" && url) {
      return [
        "figure",
        attributes,
        ["img", { src: url, alt: name || detail || "Page image" }],
        detail
          ? ["figcaption", { class: "needt-page-special-block-detail" }, detail]
          : "",
      ];
    }
    if (
      [
        "FILE",
        "LINK",
        "BOOKMARK",
        "PAGE_MENTION",
        "TASK_REFERENCE",
        "PROJECT_REFERENCE",
      ].includes(kind) &&
      url
    ) {
      return [
        "div",
        attributes,
        [
          "a",
          {
            href: url,
            target: "_blank",
            rel: "noreferrer noopener",
            class: "needt-page-special-block-link",
          },
          detail || url,
        ],
      ];
    }
    return [
      "div",
      attributes,
      [
        "span",
        { class: "needt-page-special-block-label" },
        LABELS[kind] || kind,
      ],
      detail
        ? ["span", { class: "needt-page-special-block-detail" }, detail]
        : ["span", { class: "needt-page-special-block-detail" }, "Empty"],
    ];
  },
});
