"use client";

import { newDate } from "@/lib/date-utils";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import { mergeQueries } from "../../connections/query";
import type { TrashController } from "../../places/useTrashController";
import { PkButton, PkEmpty, PkGlyph, PkScreen, PkSection } from "../kit";
import { PhoneState, PplRow } from "./Parts";
import { trashHits, trashSectionsOf, trashSub } from "./logic";

const tr = strings["places.jsx"].TrashScreen;

/**
 * Trash on the phone (phone-places.jsx `PplTrash`), at what the desktop port
 * wired: tasks and moodboards the person deleted, newest first, each with how
 * many of its 30 days are left and a Restore button (notice with Undo).
 * Nothing purges after 30 days yet; the line is shown so the promise is.
 *
 * //todo: pages, Restore all, Delete forever, Empty Trash and the hold menu
 * wait for the routes the desktop's `TrashScreen` names (hard delete, a
 * list-trashed-pages mode, page restore) and the worker's 30-day purge.
 */
export function TrashPhone({ c }: { c: TrashController }) {
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
  const sections = trashSectionsOf({
    tasks: dead,
    boards: gone,
    projectName,
    now: newDate(),
    timeZone,
  });
  const total = dead.length + gone.length;
  const restore = (kind: "task" | "board", id: string, title: string) =>
    kind === "task" ? restoreTask(id, title) : restoreBoard(id, title);
  const titleOf = (kind: "task" | "board", id: string) =>
    (kind === "task" ? dead : gone).find((x) => x.id === id)?.title ?? "";

  return (
    <PkScreen
      screen="trash"
      title="Trash"
      glyph="trash"
      sub={trashSub(total)}
      onPull={{
        search: (q) => trashHits(sections, q),
        onPick: (h) => {
          const [kind, id] = h.id.split(":") as ["task" | "board", string];
          void restore(kind, id, titleOf(kind, id));
        },
        placeholder: "Search Trash",
        hint: "Anything deleted in the last 30 days. Pick it to restore it.",
      }}
    >
      <PhoneState query={mergeQueries([tasks, boards])} screen="trash">
        {!total ? (
          <PkEmpty
            title={tr.trash_is_empty}
            line={"Delete a task or a moodboard — it lands here first."}
          />
        ) : (
          sections.map((s) => (
            <PkSection
              key={s.id}
              title={s.label}
              count={s.rows.length}
              glyph={s.glyph}
              className="ppl-sec"
            >
              {s.rows.map((r) => (
                <PplRow
                  key={`${r.kind}:${r.id}`}
                  title={r.title}
                  meta={r.meta}
                  lead={
                    r.kind === "task" ? (
                      <PkGlyph kind="task" size={40} />
                    ) : (
                      <PkGlyph place="moodboards" size={40} />
                    )
                  }
                  data={{ "data-ppl-trash": `${r.kind}:${r.id}` }}
                  action={
                    <PkButton
                      kind="primary"
                      small
                      className="ppl-act"
                      aria-label={`Restore “${r.title}”`}
                      onClick={() =>
                        void restore(r.kind, r.id, titleOf(r.kind, r.id))
                      }
                      data-ppl-restore={`${r.kind}:${r.id}`}
                    >
                      Restore
                    </PkButton>
                  }
                />
              ))}
            </PkSection>
          ))
        )}
      </PhoneState>
    </PkScreen>
  );
}
