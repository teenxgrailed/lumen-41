"use client";

import { type ReactNode, useEffect } from "react";

import { newDate } from "@/lib/date-utils";

import strings from "../../../../docs/port/prototype/port/strings/en.json";
import { registerCtx } from "../ctx/registry";
import { DocThumb, useDocTokens } from "../docs/DocParts";
import { Art } from "../menu/Art";
import { StScreen } from "../states/StScreen";
import { PlaceHeader } from "./PlaceHeader";
import { TrashConfirm } from "./TrashConfirm";
import { trashMeta, trashSections } from "./derive";
import { mergeQueries } from "./query";
import type { TrashController } from "./useTrashController";

const tr = strings["places.jsx"].TrashScreen;

function TrashRow({
  i,
  ctx,
  id,
  thumb,
  title,
  meta,
  onRestore,
  onDeleteForever,
}: {
  i: number;
  ctx: string;
  id: string;
  thumb: ReactNode;
  title: string;
  meta: string;
  onRestore: () => void;
  /** Only where the server can delete for good (pages and moodboards). */
  onDeleteForever?: () => void;
}) {
  return (
    <div
      className="nx-swap pl-trash-row"
      data-ctx={ctx}
      data-ctx-id={id}
      style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
    >
      {thumb}
      <span className="pl-trash-col-3">
        <span className="pl-strong pl-trash-title" title={title}>
          {title}
        </span>
        <span className="pl-meta pl-trash-meta" title={meta}>
          {meta}
        </span>
      </span>
      <button
        type="button"
        className="nx-btn nx-btn-secondary"
        onClick={onRestore}
      >
        Restore
      </button>
      {onDeleteForever ? (
        // The click opens a confirm (the dialog says there is no Undo).
        <button
          type="button"
          className="nx-btn nx-btn-danger"
          data-trash-forever=""
          onClick={onDeleteForever}
        >
          Delete forever
        </button>
      ) : null}
    </div>
  );
}

const iconThumb = (icon: "task" | "stack") => (
  <span className="pl-trash-task" aria-hidden="true">
    <Art name={icon} size={30} />
  </span>
);

/**
 * Trash (places.jsx `TrashScreen`): pages, tasks and moodboards the person
 * deleted, each restorable and each showing how many of its 30 days are left.
 * Trash is separate from archive. Pages and moodboards can be deleted for good
 * (one, or Empty Trash for all of them) after a confirm.
 * Nothing purges after 30 days yet; the count is shown so the promise is
 * visible, the worker job is a follow-up.
 */
const COPY = {
  meta: "Pages, tasks and moodboards stay here for 30 days",
  emptyLine: "Delete a page, a task or a moodboard \u2014 it lands here first.",
};

export function TrashScreen({ c }: { c: TrashController }) {
  const {
    timeZone,
    tasks,
    boards,
    docs,
    dead,
    gone,
    pages,
    projectName,
    restoreTask,
    restoreBoard,
    restorePage,
    setAsk,
  } = c;

  const read = useDocTokens();
  const now = newDate();
  const { total, headings } = trashSections({
    pages: pages.length,
    tasks: dead.length,
    boards: gone.length,
  });
  const canEmpty = pages.length + dead.length + gone.length > 0;

  // Right-click on a row: Restore (the rows carry data-ctx / data-ctx-id).
  useEffect(() => {
    const offPage = registerCtx("trash-page", ({ id }) => {
      const p = pages.find((x) => x.id === id);
      return p
        ? [[{ label: "Restore", run: () => void restorePage(p.id, p.title) }]]
        : null;
    });
    const offTask = registerCtx("trash-task", ({ id }) => {
      const t = dead.find((x) => x.id === id);
      return t
        ? [[{ label: "Restore", run: () => void restoreTask(t.id, t.title) }]]
        : null;
    });
    const offBoard = registerCtx("trash", ({ id }) => {
      const b = gone.find((x) => x.id === id);
      return b
        ? [[{ label: "Restore", run: () => void restoreBoard(b.id, b.title) }]]
        : null;
    });
    return () => {
      offPage();
      offTask();
      offBoard();
    };
    // The restore handlers only read stable mutation handles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, dead, gone]);

  return (
    <div className="scroll-inner pl-page" data-v3-screen="trash">
      <PlaceHeader
        art="trash"
        title={tr.trash}
        meta={COPY.meta}
        actions={
          canEmpty ? (
            <button
              type="button"
              className="nx-btn nx-btn-danger"
              data-trash-empty=""
              onClick={() => setAsk({ kind: "all" })}
            >
              {tr.empty_trash}
            </button>
          ) : null
        }
      />
      <StScreen
        query={mergeQueries([tasks, boards, docs])}
        kind="list"
        screen="trash"
      >
        {!total ? (
          <div className="nx-swap pl-trash-col">
            <Art name="trash" size={56} />
            <span className="pl-empty-text">{tr.trash_is_empty}</span>
            <span className="pl-line">{COPY.emptyLine}</span>
          </div>
        ) : (
          <div className="pl-trash-col-2">
            {pages.length && headings ? (
              <h2 className="pl-trash-h">{tr.pages}</h2>
            ) : null}
            {pages.map((p, i) => (
              <TrashRow
                key={p.id}
                i={i}
                ctx="trash-page"
                id={p.id}
                thumb={<DocThumb doc={p} read={read} w={30} h={38} />}
                title={p.title || tr.untitled}
                meta={trashMeta(
                  p.trashedAt!,
                  now,
                  timeZone,
                  projectName(p.projectId)
                    ? `from ${projectName(p.projectId)}`
                    : undefined
                )}
                onRestore={() => void restorePage(p.id, p.title)}
                onDeleteForever={() =>
                  setAsk({ kind: "page", id: p.id, title: p.title })
                }
              />
            ))}
            {dead.length && (headings || !gone.length) ? (
              <h2 className="pl-trash-h">{tr.tasks}</h2>
            ) : null}
            {dead.map((t, i) => (
              <TrashRow
                key={t.id}
                i={pages.length + i}
                ctx="trash-task"
                id={t.id}
                thumb={iconThumb("task")}
                title={t.title || tr.untitled}
                meta={trashMeta(
                  t.trashedAt!,
                  now,
                  timeZone,
                  projectName(t.projectId)
                    ? `from ${projectName(t.projectId)}`
                    : undefined
                )}
                onRestore={() => void restoreTask(t.id, t.title)}
                onDeleteForever={() =>
                  setAsk({ kind: "task", id: t.id, title: t.title })
                }
              />
            ))}
            {gone.length && headings ? (
              <h2 className="pl-trash-h">{tr.moodboards}</h2>
            ) : null}
            {gone.map((b, i) => (
              <TrashRow
                key={b.id}
                i={pages.length + dead.length + i}
                ctx="trash"
                id={b.id}
                thumb={iconThumb("stack")}
                title={b.title || tr.untitled_moodboard}
                meta={trashMeta(b.trashedAt!, now, timeZone)}
                onRestore={() => void restoreBoard(b.id, b.title)}
                onDeleteForever={() =>
                  setAsk({ kind: "board", id: b.id, title: b.title })
                }
              />
            ))}
          </div>
        )}
      </StScreen>
      <TrashConfirm c={c} />
    </div>
  );
}
