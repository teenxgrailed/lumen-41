import { Node, mergeAttributes } from "@tiptap/core";

/**
 * A live table on a page. The document holds only the table's id and title;
 * columns and rows live beside the page (`LiveTable`), so rows can be added
 * while the page is open. The editor swaps this plain rendering for the
 * interactive view (`LiveTableBlock`); server code (collaboration, export,
 * importers) uses the node as declared here.
 */
export const LiveTableNode = Node.create({
  name: "needtLiveTable",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      blockId: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-block-id"),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.blockId
            ? { "data-block-id": String(attributes.blockId) }
            : {},
      },
      tableId: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-needt-live-table") || "",
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-needt-live-table": String(attributes.tableId || ""),
        }),
      },
      title: { default: "Table" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-needt-live-table]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "needt-page-special-block needt-page-special-block--live_table",
      }),
      ["span", { class: "needt-page-special-block-label" }, "Table"],
      [
        "span",
        { class: "needt-page-special-block-detail" },
        String(node.attrs.title || "Table"),
      ],
    ];
  },
});
