import { getSchema } from "@tiptap/core";
import ImageExtension from "@tiptap/extension-image";
import LinkExtension from "@tiptap/extension-link";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";

import { BlockFlash } from "@/components/documents/BlockFlash";
import { BlockIdentity } from "@/components/documents/BlockIdentity";
import { PageBlockNode } from "@/components/pages/PageBlockNode";
import { pageContainerBlocks } from "@/components/pages/blocks";

/**
 * The editor's extension list, shared with server-side code that needs the
 * same document model (the Notion importer parses Markdown against it).
 */
export const pageEditorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: false,
    undoRedo: false,
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  ImageExtension.configure({ allowBase64: false }),
  LinkExtension.configure({
    autolink: true,
    defaultProtocol: "https",
    openOnClick: false,
  }),
  TableKit.configure({ table: { resizable: true } }),
  BlockIdentity,
  BlockFlash,
  ...pageContainerBlocks,
  PageBlockNode,
];

export const pageEditorSchema = getSchema(pageEditorExtensions);
