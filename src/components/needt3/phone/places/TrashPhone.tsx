"use client";

import { useState } from "react";

import { LuTrash2 } from "react-icons/lu";

import { newDate } from "@/lib/date-utils";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import { mergeQueries } from "../../connections/query";
import type { TrashController } from "../../places/useTrashController";
import {
  PkActions,
  type PkActs,
  PkButton,
  PkEmpty,
  PkGlyph,
  PkScreen,
  PkSection,
} from "../kit";
import { PhoneState, PplRow } from "./Parts";
import { trashHits, trashSectionsOf, trashSub } from "./logic";

const tr = strings["places.jsx"].TrashScreen;

/**
 * Trash on the phone (phone-places.jsx `PplTrash`), at what the desktop port
 * wired: tasks and moodboards the person deleted, newest first, each with how
 * many of its 30 days are left and a Restore button (notice with Undo).
 * Nothing purges after 30 days yet; the line is shown so the promise is.
 *
 * A moodboard also has "Delete forever" (a confirm sheet; no Undo).
 * //todo: pages, Restore all, tasks' Delete forever, Empty Trash and the hold
 * menu wait for the routes the desktop's `TrashScreen` names (hard delete for
 * tasks, a list-trashed-pages mode, page restore) and the worker's 30-day purge.
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
    deleteBoardForever,
  } = c;
  const [acts, setActs] = useState<PkActs | null>(null);
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
                    <>
                      {r.kind === "board" ? (
                        <PkButton
                          kind="ghost"
                          small
                          icon={<LuTrash2 size={16} aria-hidden />}
                          aria-label={`Delete “${r.title}” forever`}
                          onClick={() =>
                            setActs({
                              title: r.title,
                              meta: "Deleted for good",
                              actions: [
                                {
                                  label: "Delete forever",
                                  hint: "The board, its references and pictures. This can’t be undone.",
                                  icon: <LuTrash2 size={18} aria-hidden />,
                                  danger: true,
                                  onClick: () =>
                                    void deleteBoardForever(
                                      r.id,
                                      titleOf("board", r.id)
                                    ),
                                },
                              ],
                            })
                          }
                          data-ppl-forever={r.id}
                        />
                      ) : null}
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
                    </>
                  }
                />
              ))}
            </PkSection>
          ))
        )}
      </PhoneState>
      <PkActions acts={acts} onClose={() => setActs(null)} />
    </PkScreen>
  );
}
