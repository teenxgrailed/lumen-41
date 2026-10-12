"use client";

import { useEffect } from "react";

import { newDate } from "@/lib/date-utils";

import strings from "../../../../docs/port/prototype/port/strings/en.json";
import { registerCtx } from "../ctx/registry";
import { Art } from "../menu/Art";
import { StScreen } from "../states/StScreen";
import { PlaceHeader } from "./PlaceHeader";
import { trashMeta, trashSections } from "./derive";
import { mergeQueries } from "./query";
import type { TrashController } from "./useTrashController";

const tr = strings["places.jsx"].TrashScreen;

function TrashRow({
  i,
  ctx,
  id,
  icon,
  title,
  meta,
  onRestore,
}: {
  i: number;
  ctx: string;
  id: string;
  icon: "task" | "stack";
  title: string;
  meta: string;
  onRestore: () => void;
}) {
  return (
    <div
      className="nx-swap pl-trash-row"
      data-ctx={ctx}
      data-ctx-id={id}
      style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
    >
      <span className="pl-trash-task" aria-hidden="true">
        <Art name={icon} size={30} />
      </span>
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
      {/* //todo: "Delete forever" and "Empty Trash". DELETE /api/tasks/:id and
          DELETE /api/moodboards/:id only archive, which is not Trash; both
          wait for a hard-delete route (and the 30-day purge job). */}
    </div>
  );
}

/**
 * Trash (places.jsx `TrashScreen`): tasks and moodboards the person deleted,
 * each restorable and each showing how many of its 30 days are left. Trash is
 * separate from archive. Nothing purges after 30 days yet; the count is shown
 * so the promise is visible, the worker job is a follow-up.
 *
 * //todo: Pages. `GET /api/pages` hides trashed pages and there is no route
 * that lists them, and `PATCH /api/pages/:id { trashed: false }` cannot
 * restore one either (page access resolves only untrashed pages). Until both
 * exist the copy here promises tasks and moodboards only, not pages.
 */
const COPY = {
  meta: "Tasks and moodboards stay here for 30 days",
  emptyLine: "Delete a task or a moodboard \u2014 it lands here first.",
};

export function TrashScreen({ c }: { c: TrashController }) {
  const {
    timeZone,
    tasks,
    boards,
    dead,
    gone,
    projectName,
    restoreTask,
    restoreBoard,
  } = c;

  const now = newDate();
  const { total, headings } = trashSections({
    pages: 0, //todo: trashed pages, once a list mode and a restore route exist
    tasks: dead.length,
    boards: gone.length,
  });

  // Right-click on a row: Restore (the rows carry data-ctx / data-ctx-id).
  useEffect(() => {
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
      offTask();
      offBoard();
    };
    // restoreTask / restoreBoard only read stable mutation handles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dead, gone]);

  return (
    <div className="scroll-inner pl-page" data-v3-screen="trash">
      <PlaceHeader art="trash" title={tr.trash} meta={COPY.meta} />
      <StScreen
        query={mergeQueries([tasks, boards])}
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
            {dead.length && (headings || !gone.length) ? (
              <h2 className="pl-trash-h">{tr.tasks}</h2>
            ) : null}
            {dead.map((t, i) => (
              <TrashRow
                key={t.id}
                i={i}
                ctx="trash-task"
                id={t.id}
                icon="task"
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
              />
            ))}
            {gone.length && headings ? (
              <h2 className="pl-trash-h">{tr.moodboards}</h2>
            ) : null}
            {gone.map((b, i) => (
              <TrashRow
                key={b.id}
                i={dead.length + i}
                ctx="trash"
                id={b.id}
                icon="stack"
                title={b.title || tr.untitled_moodboard}
                meta={trashMeta(b.trashedAt!, now, timeZone)}
                onRestore={() => void restoreBoard(b.id, b.title)}
              />
            ))}
          </div>
        )}
      </StScreen>
    </div>
  );
}
