import { Mark, markInputRule, mergeAttributes } from "@tiptap/core";

import { DOC_TEXTS } from "@/components/needt3/docs/style";

/**
 * Highlight and text colour for a run of text. Both take their colour from the
 * document palette (the hues the Style panel offers for page text), stored by
 * id (`umber`, `wine`, …), never as a literal: the stylesheet maps an id to
 * the reading that suits the page it sits on, so a colour stays legible on a
 * pale page and on a dark one.
 */
export const MARK_COLORS = DOC_TEXTS.filter((t) => t.dk && t.lt).map((t) => ({
  id: t.id,
  name: t.name,
}));

const IDS: ReadonlySet<string> = new Set(MARK_COLORS.map((c) => c.id));

export const DEFAULT_HIGHLIGHT = "umber";

export function markColor(value: unknown, fallback: string): string {
  return typeof value === "string" && IDS.has(value) ? value : fallback;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    highlight: {
      setHighlight: (color?: string) => ReturnType;
      toggleHighlight: (color?: string) => ReturnType;
      unsetHighlight: () => ReturnType;
    };
    textColor: {
      setTextColor: (color: string) => ReturnType;
      unsetTextColor: () => ReturnType;
    };
  }
}

export const Highlight = Mark.create({
  name: "highlight",

  addAttributes() {
    return {
      color: {
        default: DEFAULT_HIGHLIGHT,
        parseHTML: (element: HTMLElement) =>
          markColor(element.getAttribute("data-hl"), DEFAULT_HIGHLIGHT),
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-hl": markColor(attributes.color, DEFAULT_HIGHLIGHT),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "mark[data-hl]" }, { tag: "mark" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["mark", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setHighlight:
        (color) =>
        ({ commands }) =>
          commands.setMark(this.name, {
            color: markColor(color, DEFAULT_HIGHLIGHT),
          }),
      toggleHighlight:
        (color) =>
        ({ commands, editor }) =>
          editor.isActive(this.name, {
            color: markColor(color, DEFAULT_HIGHLIGHT),
          })
            ? commands.unsetMark(this.name)
            : commands.setMark(this.name, {
                color: markColor(color, DEFAULT_HIGHLIGHT),
              }),
      unsetHighlight:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-h": () => this.editor.commands.toggleHighlight(),
    };
  },

  addInputRules() {
    // ==marked== turns into a highlight, as in Craft's Markdown shortcuts.
    return [
      markInputRule({
        find: /(?:^|\s)(==(?!\s+==)((?:[^=]+))==(?!\s+==))$/,
        type: this.type,
        getAttributes: () => ({ color: DEFAULT_HIGHLIGHT }),
      }),
    ];
  },
});

export const TextColor = Mark.create({
  name: "textColor",

  addAttributes() {
    return {
      color: {
        default: "umber",
        parseHTML: (element: HTMLElement) =>
          markColor(element.getAttribute("data-tc"), "umber"),
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-tc": markColor(attributes.color, "umber"),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-tc]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setTextColor:
        (color) =>
        ({ commands }) =>
          commands.setMark(this.name, { color: markColor(color, "umber") }),
      unsetTextColor:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

export const pageColorMarks = [Highlight, TextColor];
