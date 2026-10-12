"use client";

import { useEffect, useMemo, useState } from "react";

import {
  LuArrowDown,
  LuArrowUp,
  LuCheck,
  LuEllipsis,
  LuPlus,
} from "react-icons/lu";

import { useBoards } from "@/lib/needt3/hooks/boards";
import { usePlan } from "@/lib/needt3/hooks/plan";
import type { V3Board } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

import strings from "../../../../docs/port/prototype/port/strings/en.json";
import { registerCtx } from "../ctx/registry";
import { Art } from "../menu/Art";
import { RichMenu } from "../menu/RichMenu";
import { PlEmpty, StScreen } from "../states/StScreen";
import { DropMenu, MenuRow } from "./PlMenu";
import { PlaceHeader } from "./PlaceHeader";
import {
  BOARD_SORTS,
  type BoardSort,
  DEFAULT_BOARD_SORT,
  FREE_BOARDS,
  boardCount,
  boardGate,
  parseBoardSort,
  pickBoardSort,
  sortBoards,
} from "./derive";
import type { BoardsController } from "./useBoardsController";

const mb = strings["places.jsx"].MoodboardsScreen;
const SORT_KEY = "needt.mbSort";

const readSort = (): BoardSort => {
  try {
    return parseBoardSort(window.localStorage.getItem(SORT_KEY));
  } catch {
    return DEFAULT_BOARD_SORT;
  }
};
const writeSort = (sort: BoardSort) => {
  try {
    window.localStorage.setItem(SORT_KEY, JSON.stringify(sort));
  } catch {
    /* private mode: the sort lasts until reload */
  }
};

const upgrade = () => window.location.assign("/settings#billing");

/** The desktop's notice when a new board is refused by the Free allowance. */
export function notifyBoardsBlocked() {
  notify.info(
    `Free keeps ${FREE_BOARDS === 1 ? "one board" : `${FREE_BOARDS} boards`}. Upgrade to Pro for more.`,
    { action: { label: "See plans", onClick: upgrade } }
  );
}

/**
 * Moodboards (places.jsx `MoodboardsScreen`): a grid of boards, not a canvas.
 * Create, sort, open and delete (to Trash, with Undo).
 *
 * //todo: board items. The list route sends no items, so a card cannot show
 * its collage or "n references" yet; a board's own page is the old workspace
 * at `/moodboards/[id]` on the desktop (images, links, colours, notes,
 * Pinterest, guest view, Share) and the phone board page under 700 px.
 * //todo: members avatars / "Private" lock on the card need the members list.
 */
export function MoodboardsScreen({ ctl }: { ctl: BoardsController }) {
  const boards = useBoards();
  const plan = usePlan();
  const [sort, setSortState] = useState<BoardSort>(DEFAULT_BOARD_SORT);
  useEffect(() => setSortState(readSort()), []);

  const live = useMemo(
    () => (boards.data ?? []).filter((b) => !b.trashedAt),
    [boards.data]
  );
  const gate = boardGate(plan.data?.kind, live.length);
  const shown = sortBoards(live, sort);

  const setSort = (key: BoardSort["key"]) =>
    setSortState((cur) => {
      const next = pickBoardSort(cur, key);
      writeSort(next);
      return next;
    });

  const open = ctl.open;

  // Create, the notice with Undo and opening the board are the controller's:
  // they are not left to a screen that may unmount mid-write.
  const newBoard = () =>
    ctl.make(mb.untitled_moodboard, () => mb.moodboard_created);

  const remove = (b: V3Board) =>
    ctl.remove({ id: b.id, title: b.title || mb.untitled_moodboard });

  // Right-click on a card: Open, Delete board.
  useEffect(
    () =>
      registerCtx("moodboard", ({ id }) => {
        const b = live.find((x) => x.id === id);
        return b
          ? [
              [
                { label: "Open", run: () => open(b.id) },
                {
                  label: "Delete board",
                  tone: "danger",
                  run: () => void remove(b),
                },
              ],
            ]
          : null;
      }),
    // open / remove only read stable router and mutation handles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live]
  );

  return (
    <div className="scroll-inner pl-page" data-v3-screen="moodboards">
      <PlaceHeader
        art="stack"
        title={mb.moodboards}
        meta={
          gate.max !== null
            ? `${gate.used} of ${gate.max} ${gate.max === 1 ? "board" : "boards"} on Free`
            : boardCount(live.length)
        }
        add={
          <button
            type="button"
            aria-label={mb.new_moodboard}
            title={mb.new_moodboard}
            data-page-add=""
            className="nx-btn nx-btn-secondary page-add"
            onClick={() => void newBoard()}
          >
            <LuPlus size={18} aria-hidden />
          </button>
        }
        actions={
          live.length ? (
            <DropMenu
              width={220}
              trigger={() => (
                <button
                  type="button"
                  aria-label={mb.more}
                  data-mb-more=""
                  className="nx-btn nx-btn-secondary pl-mb-round"
                >
                  <LuEllipsis size={18} aria-hidden />
                </button>
              )}
            >
              <span
                className="base-meta"
                style={{ display: "block", padding: "6px 8px 2px" }}
              >
                Sort by
              </span>
              {BOARD_SORTS.map(({ key, label }) => {
                const on = sort.key === key;
                return (
                  <MenuRow
                    key={key}
                    keepOpen
                    icon={on ? <LuCheck size={14} aria-hidden /> : null}
                    hint={
                      on ? (
                        <span className="docs-sort-arrow">
                          {sort.dir === "asc" ? (
                            <LuArrowUp size={13} aria-hidden />
                          ) : (
                            <LuArrowDown size={13} aria-hidden />
                          )}
                        </span>
                      ) : undefined
                    }
                    onClick={() => setSort(key)}
                  >
                    {label}
                  </MenuRow>
                );
              })}
            </DropMenu>
          ) : null
        }
      />
      <StScreen query={boards} kind="grid" screen="moodboards">
        {!live.length ? (
          <PlEmpty
            art={<Art name="stack" size={56} />}
            title={mb.no_moodboards_yet}
            line={`${mb.collect_pictures_links_and_colours_for_w}${
              gate.max !== null
                ? " Free keeps one board — Pro adds as many as you like."
                : ""
            }`}
            action={
              <button
                type="button"
                className="nx-btn nx-btn-primary"
                onClick={() => void newBoard()}
              >
                <LuPlus size={14} aria-hidden />
                {mb.new_moodboard}
              </button>
            }
          />
        ) : (
          <div className="pl-mb-grid-3">
            {shown.map((b, i) => (
              <div
                key={b.id}
                role="button"
                tabIndex={0}
                data-ctx="moodboard"
                data-ctx-id={b.id}
                className="nx-swap nx-press nx-focus pl-mb-card pl-mb-col-3"
                style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
                onClick={() => open(b.id)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && e.key === "Enter")
                    open(b.id);
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    height: 150,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: "var(--radius-xl)",
                    background: "var(--fill-2)",
                  }}
                >
                  <Art name="stack" size={44} />
                </span>
                <span className="pl-mb-row-5">
                  <span className="pl-mb-col-4">
                    <span className="pl-link-sheet-text-2">
                      {b.title || mb.untitled_moodboard}
                    </span>
                    <span className="pl-link-sheet-row-2">
                      {b.pinterestBoardId ? "Pinterest board" : "Moodboard"}
                    </span>
                  </span>
                  <span
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="pl-habit-menu-row"
                  >
                    <RichMenu
                      small
                      align="right"
                      width={200}
                      items={[
                        {
                          art: "page",
                          title: "Open",
                          onClick: () => open(b.id),
                        },
                        {
                          art: "trash",
                          title: "Delete board",
                          onClick: () => void remove(b),
                        },
                      ]}
                      trigger={
                        <button
                          type="button"
                          aria-label={`${mb.more} for ${b.title}`}
                          className="nx-press pl-mb-more pl-mb-grid-4"
                        >
                          <LuEllipsis size={15} aria-hidden />
                        </button>
                      }
                    />
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </StScreen>
    </div>
  );
}
