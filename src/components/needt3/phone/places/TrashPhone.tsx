"use client";

import { LuTrash2 } from "react-icons/lu";

import { newDate } from "@/lib/date-utils";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import { mergeQueries } from "../../connections/query";
import { trashAskText } from "../../places/derive";
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

type Kind = "page" | "task" | "board";

/**
 * Trash on the phone (phone-places.jsx `PplTrash`): pages, tasks and
 * moodboards the person deleted, newest first, each with how many of its 30
 * days are left and a Restore button (notice with Undo). A page or a moodboard
 * also has "Delete forever", and the header has "Empty Trash": both open a
 * confirm sheet that says there is no Undo (the same words as the desktop's
 * dialog). Nothing purges after 30 days yet; the line is shown so the promise
 * is.
 * //todo: Restore all, tasks' Delete forever and the hold menu wait for a hard
 * delete on DELETE /api/tasks/:id and the worker's 30-day purge.
 */
export function TrashPhone({ c }: { c: TrashController }) {
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
    ask,
    setAsk,
    runAsk,
    emptyCounts,
  } = c;
  const sections = trashSectionsOf({
    pages,
    tasks: dead,
    boards: gone,
    projectName,
    now: newDate(),
    timeZone,
  });
  const total = pages.length + dead.length + gone.length;
  const canEmpty = pages.length + gone.length > 0;
  const titleOf = (kind: Kind, id: string) =>
    (kind === "page" ? pages : kind === "task" ? dead : gone).find(
      (x) => x.id === id
    )?.title ?? "";
  const restore = (kind: Kind, id: string) => {
    const title = titleOf(kind, id);
    return kind === "page"
      ? restorePage(id, title)
      : kind === "task"
        ? restoreTask(id, title)
        : restoreBoard(id, title);
  };

  // The confirm is the controller's, so it survives a resize across 700 px.
  const words = ask
    ? trashAskText(ask.kind === "all" ? { kind: "all", ...emptyCounts } : ask)
    : null;
  const acts: PkActs | null =
    ask && words
      ? {
          title: words.title,
          meta: words.body,
          actions: [
            {
              label: words.confirm,
              hint: "This can’t be undone.",
              icon: <LuTrash2 size={18} aria-hidden />,
              danger: true,
              onClick: () => void runAsk(ask),
              data: { "data-ppl-confirm": "" },
            },
          ],
        }
      : null;

  return (
    <PkScreen
      screen="trash"
      title="Trash"
      glyph="trash"
      sub={trashSub(total)}
      right={
        canEmpty ? (
          <PkButton
            kind="quiet"
            small
            data-ppl-empty=""
            onClick={() => setAsk({ kind: "all" })}
          >
            {tr.empty_trash}
          </PkButton>
        ) : null
      }
      onPull={{
        search: (q) => trashHits(sections, q),
        onPick: (h) => {
          const [kind, id] = h.id.split(":") as [Kind, string];
          void restore(kind, id);
        },
        placeholder: "Search Trash",
        hint: "Anything deleted in the last 30 days. Pick it to restore it.",
      }}
    >
      <PhoneState query={mergeQueries([tasks, boards, docs])} screen="trash">
        {!total ? (
          <PkEmpty
            title={tr.trash_is_empty}
            line={"Delete a page, a task or a moodboard — it lands here first."}
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
                    r.kind === "page" ? (
                      <PkGlyph place="docs" size={40} />
                    ) : r.kind === "task" ? (
                      <PkGlyph kind="task" size={40} />
                    ) : (
                      <PkGlyph place="moodboards" size={40} />
                    )
                  }
                  data={{ "data-ppl-trash": `${r.kind}:${r.id}` }}
                  action={
                    <>
                      {r.kind !== "task" ? (
                        <PkButton
                          kind="ghost"
                          small
                          icon={<LuTrash2 size={16} aria-hidden />}
                          aria-label={`Delete “${r.title}” forever`}
                          onClick={() =>
                            setAsk({
                              kind: r.kind as "page" | "board",
                              id: r.id,
                              title: titleOf(r.kind, r.id),
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
                        onClick={() => void restore(r.kind, r.id)}
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
      <PkActions acts={acts} onClose={() => setAsk(null)} />
    </PkScreen>
  );
}
