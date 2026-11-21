"use client";

import { ReactNodeViewRenderer } from "@tiptap/react";

import { LiveTableNode } from "@/components/pages/blocks/live-table";

import { LiveTableBlock } from "./LiveTableBlock";

/** The editor's live table: the shared node with the interactive React view. */
export const LiveTableEditorNode = LiveTableNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(LiveTableBlock);
  },
});
