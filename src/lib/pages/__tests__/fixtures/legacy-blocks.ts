/** Pages stored before Callout, Toggle and Columns were real blocks. */
export const LEGACY_PAGE_BLOCKS = [
  {
    id: "old-callout",
    parentBlockId: null,
    type: "CALLOUT",
    position: 1024,
    createdBy: "HUMAN",
    content: {
      json: {
        type: "needtPageBlock",
        attrs: {
          blockId: "old-callout",
          kind: "CALLOUT",
          data: JSON.stringify({ text: "Ship on the 26th" }),
        },
      },
    },
  },
  {
    id: "old-toggle",
    parentBlockId: null,
    type: "TOGGLE",
    position: 2048,
    createdBy: "HUMAN",
    content: {
      json: {
        type: "needtPageBlock",
        attrs: {
          blockId: "old-toggle",
          kind: "TOGGLE",
          data: JSON.stringify({ text: "Release notes" }),
        },
      },
    },
  },
  {
    id: "old-columns",
    parentBlockId: null,
    type: "COLUMNS",
    position: 3072,
    createdBy: "HUMAN",
    content: {
      json: {
        type: "needtPageBlock",
        attrs: {
          blockId: "old-columns",
          kind: "COLUMNS",
          data: JSON.stringify({ title: "Two columns" }),
        },
      },
    },
  },
  {
    id: "old-link",
    parentBlockId: null,
    type: "LINK",
    position: 4096,
    createdBy: "HUMAN",
    content: {
      json: {
        type: "needtPageBlock",
        attrs: {
          blockId: "old-link",
          kind: "LINK",
          data: JSON.stringify({ url: "https://example.com" }),
        },
      },
    },
  },
  {
    id: "old-empty-callout",
    parentBlockId: null,
    type: "CALLOUT",
    position: 5120,
    createdBy: "HUMAN",
    content: {
      json: {
        type: "needtPageBlock",
        attrs: { blockId: "old-empty-callout", kind: "CALLOUT", data: "{}" },
      },
    },
  },
] as never;
