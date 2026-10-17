import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Callout: an icon and a colour in front of ordinary blocks you can edit
 * (paragraphs, lists, a checklist, …). The icon and colour are attributes of
 * the node; the icon button opens a small picker.
 *
 * The colours are the document hues (themes.css `--doc-text-*`), so a callout
 * sits in the same palette as the page and its text colours.
 */
export const CALLOUT_COLORS = [
  "default",
  "umber",
  "wine",
  "plum",
  "navy",
  "forest",
] as const;
export type CalloutColor = (typeof CALLOUT_COLORS)[number];

export const CALLOUT_ICONS = [
  "💡",
  "📌",
  "⚠️",
  "✅",
  "❗",
  "❓",
  "📝",
  "🎯",
  "🔥",
  "⭐",
  "💬",
  "🚀",
] as const;

export const DEFAULT_CALLOUT_ICON = CALLOUT_ICONS[0];

const COLOR_LABEL: Record<CalloutColor, string> = {
  default: "Default",
  umber: "Umber",
  wine: "Wine",
  plum: "Plum",
  navy: "Navy",
  forest: "Forest",
};

export function calloutColor(value: unknown): CalloutColor {
  return CALLOUT_COLORS.includes(value as CalloutColor)
    ? (value as CalloutColor)
    : "default";
}

/** Only a short, plain icon string is stored or drawn. */
export function calloutIcon(value: unknown): string {
  return typeof value === "string" && value.length > 0 && value.length <= 16
    ? value
    : DEFAULT_CALLOUT_ICON;
}

export const Callout = Node.create({
  name: "needtCallout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      icon: {
        default: DEFAULT_CALLOUT_ICON,
        parseHTML: (element: HTMLElement) =>
          calloutIcon(element.getAttribute("data-icon")),
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-icon": calloutIcon(attributes.icon),
        }),
      },
      color: {
        default: "default",
        parseHTML: (element: HTMLElement) =>
          calloutColor(element.getAttribute("data-color")),
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-color": calloutColor(attributes.color),
        }),
      },
    };
  },

  parseHTML() {
    return [
      { tag: "div[data-needt-callout]", contentElement: ".needt-callout-body" },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-needt-callout": "",
        class: "needt-callout",
      }),
      [
        "span",
        { class: "needt-callout-icon", "aria-hidden": "true" },
        calloutIcon(node.attrs.icon),
      ],
      ["div", { class: "needt-callout-body" }, 0],
    ];
  },

  addNodeView() {
    return ({ node: initial, getPos, editor }) => {
      let node = initial;
      const dom = document.createElement("div");
      dom.className = "needt-callout";
      dom.setAttribute("data-needt-callout", "");

      const iconButton = document.createElement("button");
      iconButton.type = "button";
      iconButton.className = "needt-callout-icon";
      iconButton.contentEditable = "false";
      iconButton.setAttribute("aria-haspopup", "true");
      iconButton.setAttribute("aria-expanded", "false");
      const body = document.createElement("div");
      body.className = "needt-callout-body";

      const menu = document.createElement("div");
      menu.className = "needt-callout-menu";
      menu.contentEditable = "false";
      menu.hidden = true;
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", "Callout icon and colour");
      dom.append(iconButton, body, menu);

      const update = (attrs: { icon?: string; color?: CalloutColor }) => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (pos === undefined) return;
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            ...attrs,
          })
        );
      };

      const iconRow = document.createElement("div");
      iconRow.className = "needt-callout-menu-icons";
      for (const icon of CALLOUT_ICONS) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "menuitem");
        button.setAttribute("data-callout-icon", icon);
        button.setAttribute("aria-label", `Icon ${icon}`);
        button.textContent = icon;
        iconRow.append(button);
      }
      const colorRow = document.createElement("div");
      colorRow.className = "needt-callout-menu-colors";
      for (const color of CALLOUT_COLORS) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "menuitem");
        button.setAttribute("data-callout-color", color);
        button.setAttribute("aria-label", `${COLOR_LABEL[color]} colour`);
        colorRow.append(button);
      }
      menu.append(iconRow, colorRow);

      const paint = () => {
        const icon = calloutIcon(node.attrs.icon);
        const color = calloutColor(node.attrs.color);
        dom.setAttribute("data-color", color);
        dom.setAttribute("data-icon", icon);
        iconButton.textContent = icon;
        iconButton.disabled = !editor.isEditable;
        iconButton.setAttribute(
          "aria-label",
          editor.isEditable ? "Change callout icon and colour" : "Callout icon"
        );
        for (const button of colorRow.children) {
          button.setAttribute(
            "aria-checked",
            String(button.getAttribute("data-callout-color") === color)
          );
        }
      };
      paint();
      // setEditable() changes no node, so the node view hears of it here.
      let wasEditable = editor.isEditable;
      const onTransaction = () => {
        if (editor.isEditable === wasEditable) return;
        wasEditable = editor.isEditable;
        if (!wasEditable) setOpen(false);
        paint();
      };
      editor.on("transaction", onTransaction);
      editor.on("update", onTransaction);

      const setOpen = (open: boolean) => {
        menu.hidden = !open;
        iconButton.setAttribute("aria-expanded", String(open));
        if (open) document.addEventListener("pointerdown", onOutside, true);
        else document.removeEventListener("pointerdown", onOutside, true);
      };
      const onOutside = (event: Event) => {
        if (!dom.contains(event.target as globalThis.Node)) setOpen(false);
      };

      iconButton.addEventListener("mousedown", (event) =>
        event.preventDefault()
      );
      iconButton.addEventListener("click", () => {
        if (editor.isEditable) setOpen(menu.hidden);
      });
      menu.addEventListener("mousedown", (event) => event.preventDefault());
      menu.addEventListener("click", (event) => {
        const target = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-callout-icon], [data-callout-color]"
        );
        if (!target) return;
        const icon = target.getAttribute("data-callout-icon");
        const color = target.getAttribute("data-callout-color");
        if (icon) update({ icon });
        if (color) update({ color: calloutColor(color) });
        setOpen(false);
      });

      return {
        dom,
        contentDOM: body,
        update(next) {
          if (next.type !== node.type) return false;
          node = next;
          paint();
          return true;
        },
        ignoreMutation(mutation) {
          if (mutation.type === "selection") return false;
          return !body.contains(mutation.target as globalThis.Node);
        },
        stopEvent(event) {
          const target = event.target as globalThis.Node;
          return iconButton.contains(target) || menu.contains(target);
        },
        destroy() {
          editor.off("transaction", onTransaction);
          editor.off("update", onTransaction);
          document.removeEventListener("pointerdown", onOutside, true);
        },
      };
    };
  },
});
