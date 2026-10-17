import type { JSONContent } from "@tiptap/core";

import { randomId } from "@/lib/uuid";

import { DEFAULT_CALLOUT_ICON } from "./callout";
import { equalWidths } from "./columns-ops";

export type ContainerCommand = "CALLOUT" | "TOGGLE" | "COLUMNS";

/** How far into a fresh block its first editable paragraph starts. */
export const CONTAINER_CARET_OFFSET: Record<ContainerCommand, number> = {
  CALLOUT: 2,
  TOGGLE: 2,
  COLUMNS: 3,
};

/** A new, empty Callout, Toggle or two-column block, ready to type into. */
export function containerBlockJson(command: ContainerCommand): JSONContent {
  const blockId = randomId();
  if (command === "TOGGLE") {
    return {
      type: "needtToggle",
      attrs: { blockId },
      content: [{ type: "paragraph" }],
    };
  }
  if (command === "CALLOUT") {
    return {
      type: "needtCallout",
      attrs: { blockId, icon: DEFAULT_CALLOUT_ICON, color: "default" },
      content: [{ type: "paragraph" }],
    };
  }
  return {
    type: "needtColumns",
    attrs: { blockId },
    content: equalWidths(2).map((width) => ({
      type: "needtColumn",
      attrs: { width },
      content: [{ type: "paragraph" }],
    })),
  };
}
