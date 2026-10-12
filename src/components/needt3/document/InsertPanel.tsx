"use client";

import type { ReactNode } from "react";

import {
  LuBookmark,
  LuCalendarDays,
  LuCircleAlert,
  LuCircleCheck,
  LuCode,
  LuColumns3,
  LuFileText,
  LuFolderKanban,
  LuHeading1,
  LuHeading2,
  LuHeading3,
  LuImage,
  LuLink,
  LuList,
  LuListChecks,
  LuListOrdered,
  LuMinus,
  LuPaperclip,
  LuQuote,
  LuTable,
  LuType,
} from "react-icons/lu";

import { runPageCommand } from "@/components/pages/page-commands";

import { docsCopy } from "../docs/DocParts";
import { DcLabel } from "./StylePanel";

const copy = docsCopy.InsertPanel;

/**
 * The Insert tab: every block the editor can make, grouped like the
 * prototype's (Basics, From Needt, Collections), as Craft's rows. A row adds
 * its block where the cursor is: the same command the "/" menu runs, sent to
 * the open editor (`pages/page-commands`). The prototype's Event, Habit, Ask
 * Needt, Gallery, Board and Card blocks and its Line / Page break rows have
 * no block in the editor, so they are not listed.
 */
export const INSERT_GROUPS: {
  id: string;
  label: string;
  rows: { command: string; label: string; icon: ReactNode }[];
}[] = [
  {
    id: "basics",
    label: copy.basics,
    rows: [
      { command: "paragraph", label: "Text", icon: <LuType size={15} /> },
      {
        command: "heading1",
        label: "Heading 1",
        icon: <LuHeading1 size={15} />,
      },
      {
        command: "heading2",
        label: "Heading 2",
        icon: <LuHeading2 size={15} />,
      },
      {
        command: "heading3",
        label: "Heading 3",
        icon: <LuHeading3 size={15} />,
      },
      { command: "bullet", label: "Bulleted list", icon: <LuList size={15} /> },
      {
        command: "ordered",
        label: "Numbered list",
        icon: <LuListOrdered size={15} />,
      },
      {
        command: "checklist",
        label: "Checklist",
        icon: <LuListChecks size={15} />,
      },
      { command: "quote", label: "Quote", icon: <LuQuote size={15} /> },
      {
        command: "CALLOUT",
        label: "Callout",
        icon: <LuCircleAlert size={15} />,
      },
      { command: "divider", label: "Divider", icon: <LuMinus size={15} /> },
      { command: "code", label: "Code", icon: <LuCode size={15} /> },
      {
        command: "PAGE_MENTION",
        label: "Page",
        icon: <LuFileText size={15} />,
      },
      { command: "FILE", label: "File", icon: <LuPaperclip size={15} /> },
      { command: "IMAGE", label: "Image", icon: <LuImage size={15} /> },
      { command: "LINK", label: "Link", icon: <LuLink size={15} /> },
      {
        command: "BOOKMARK",
        label: "Bookmark",
        icon: <LuBookmark size={15} />,
      },
    ],
  },
  {
    id: "needt",
    label: "From Needt",
    rows: [
      {
        command: "TASK_REFERENCE",
        label: "Task",
        icon: <LuCircleCheck size={15} />,
      },
      {
        command: "PROJECT_REFERENCE",
        label: "Project",
        icon: <LuFolderKanban size={15} />,
      },
      {
        command: "DATE_MENTION",
        label: "Date",
        icon: <LuCalendarDays size={15} />,
      },
    ],
  },
  {
    id: "collections",
    label: "Collections",
    rows: [
      { command: "TABLE", label: "Table", icon: <LuTable size={15} /> },
      { command: "COLUMNS", label: "Columns", icon: <LuColumns3 size={15} /> },
    ],
  },
];

export function InsertPanel({
  pageId,
  canEdit,
}: {
  pageId: string;
  canEdit: boolean;
}) {
  return (
    <div className="docs-dc-style-panel-1" data-dc-insert="">
      <span className="docs-insert-panel-1">
        {canEdit
          ? "Click a block, or type / on the page."
          : "This page is read-only, so no blocks can be added."}
      </span>
      {INSERT_GROUPS.map((g) => (
        <div key={g.id} className="doc-insert-group">
          <DcLabel>{g.label}</DcLabel>
          {g.rows.map((r, i) => (
            <button
              key={r.command}
              type="button"
              data-insert-command={r.command}
              disabled={!canEdit}
              className={
                "docs-insert-row-1 dc-row is-press doc-insert-btn" +
                (i === g.rows.length - 1 ? "" : " dc-hair")
              }
              onClick={() => runPageCommand({ pageId, command: r.command })}
            >
              <span className="docs-insert-row-2">{r.icon}</span>
              <span className="docs-dc-row-3">{r.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
