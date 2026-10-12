"use client";

import { useState } from "react";

import {
  LuChevronLeft,
  LuEllipsis,
  LuPencil,
  LuPlus,
  LuTrash2,
} from "react-icons/lu";

import { useBoard, useBoardItems, useBoards } from "@/lib/needt3/hooks/boards";
import { useTimeZone } from "@/lib/needt3/hooks/settings";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import { canEditBoard } from "../../places/derive";
import type { BoardsController } from "../../places/useBoardsController";
import {
  PkActions,
  type PkActs,
  PkButton,
  PkEmpty,
  PkGlass,
  PkGlyph,
  PkScreen,
} from "../kit";
import { PlaceState } from "../place-state/PlaceState";
import { AddSheet } from "./AddSheet";
import { ItemSheet } from "./ItemSheet";
import { NameSheet } from "./NameSheet";
import { Wall } from "./Wall";
import {
  type PhoneBoardItem,
  UNTITLED_BOARD,
  itemName,
  madeLine,
  referenceCount,
  searchItems,
} from "./model";

const t = strings["phone-habits.jsx"];

/**
 * One board (phone-habits.jsx PhbBoardPage): the back chip, the board's glyph
 * and title, Add and the board's actions, and the wall of references read
 * from `/api/moodboards/[id]/items` (skeleton while they load, the error row
 * with Retry if they fail).
 *
 * Written through the routes that exist: rename, delete (to Trash) and
 * Add a link / colour / note, Remove, all with Undo. //todo: Photo (needs an
 * upload route), editing a caption or note, Move to board, hold-to-lift
 * reorder (PATCH position), Pinterest (no connection route) and Share
 * (invite-by-email is MISSING; the list route sends no members or role).
 */
export function PhoneBoardPage({
  ctl,
  id,
}: {
  ctl: BoardsController;
  id: string;
}) {
  const boards = useBoards();
  const itemsQuery = useBoardItems(id);
  const tz = useTimeZone();
  const [acts, setActs] = useState<PkActs | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const one = useBoard(id);
  const listed = (boards.data ?? []).find((x) => x.id === id && !x.trashedAt);
  /* The list does not send the caller's role; the single-board read does.
     Until it says EDITOR or above, nothing that writes is shown. */
  const b = listed
    ? { ...listed, accessRole: one.data?.accessRole ?? listed.accessRole }
    : undefined;
  const canEdit = canEditBoard(b);
  const items: readonly PhoneBoardItem[] = itemsQuery.data ?? [];
  const open = items.find((x) => x.id === openId) ?? null;

  const options = () => {
    if (!b || !canEdit) return;
    setActs({
      title: b.title || UNTITLED_BOARD,
      actions: [
        {
          label: t.PhbBoards.rename,
          icon: <LuPencil size={18} aria-hidden />,
          hue: "var(--v2p-lav)",
          onClick: () => ctl.openRename(b),
          data: { "data-phb-act": "rename" },
        },
        {
          label: t.PhbBoards.delete_board,
          hint: t.PhbBoards.kept_in_trash_for_30_days,
          icon: <LuTrash2 size={18} aria-hidden />,
          danger: true,
          onClick: () => void ctl.remove(b, true),
          data: { "data-phb-act": "delete" },
        },
      ],
    });
  };

  const pull = {
    search: (q: string) =>
      searchItems(items, q).map((it) => ({
        id: it.id,
        title: itemName(it),
        meta: it.kind,
      })),
    onPick: (hit: { id: string }) => setOpenId(hit.id),
    placeholder: t.PhbBoardPage.search_this_board,
    hint: t.PhbBoardPage.titles_notes_colours_and_sites_on_this_b,
  };

  const head = b ? (
    <div className="phb-bh" data-phb-page={b.id}>
      <PkButton
        kind="ghost"
        icon={<LuChevronLeft size={18} aria-hidden />}
        className="phb-back"
        onClick={ctl.back}
        data-phb-back
      >
        {t.PhbBoardPage.moodboards}
      </PkButton>
      <div className="phb-bh-row">
        <PkGlyph place="moodboards" size="l" />
        <h1 className="pk-title phb-bh-title">{b.title || UNTITLED_BOARD}</h1>
      </div>
      <p className="pk-sub phb-bh-sub">
        {itemsQuery.data ? (
          <span className="phb-bh-n">{referenceCount(items.length)}</span>
        ) : null}
        <span>{madeLine(b.createdAt, tz)}</span>
      </p>
      <div className="phb-bh-acts">
        {canEdit ? (
          <>
            <PkButton
              kind="primary"
              small
              icon={<LuPlus size={16} aria-hidden />}
              onClick={() => ctl.openAdd(b.id)}
              data-phb-add
            >
              {t.PhbBoardPage.add}
            </PkButton>
            <PkGlass
              as="button"
              round
              className="phb-gbtn is-icon"
              onClick={options}
              aria-label={t.PhbBoardPage.board_options}
              data-phb-more
            >
              <LuEllipsis size={18} aria-hidden />
            </PkGlass>
          </>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <div className="phb-mb" data-pk-screen="moodboard" data-phb-view="board">
      <div className="phb-mb-stage is-board">
        <PkScreen
          screen="moodboard"
          compactTitle={b?.title || UNTITLED_BOARD}
          head={head}
          headClass="phb-bh-head"
          className="phb-board-screen"
          onPull={b ? pull : undefined}
        >
          <PlaceState query={boards} screen="moodboards">
            {!b ? (
              <PkEmpty
                title="This board is gone"
                line="It was deleted or you no longer have access."
                action={
                  <PkButton kind="primary" onClick={ctl.back}>
                    {t.PhbBoardPage.moodboards}
                  </PkButton>
                }
              />
            ) : (
              <PlaceState
                query={itemsQuery}
                screen="moodboards"
                kind="grid"
                text="Couldn’t load this board’s references — the server didn’t answer."
              >
                {items.length ? (
                  <Wall items={items} onOpen={(it) => setOpenId(it.id)} />
                ) : (
                  <PkEmpty
                    title={t.PhbBoardPage.nothing_on_this_board_yet}
                    line={
                      t.PhbBoardPage.photos_links_colours_and_notes_whatever_
                    }
                    action={
                      canEdit ? (
                        <PkButton
                          kind="primary"
                          icon={<LuPlus size={16} aria-hidden />}
                          onClick={() => ctl.openAdd(b.id)}
                        >
                          {t.PhbBoardPage.add_a_reference}
                        </PkButton>
                      ) : undefined
                    }
                  />
                )}
              </PlaceState>
            )}
          </PlaceState>
        </PkScreen>
      </div>
      <NameSheet
        ask={ctl.ask}
        saving={ctl.saving}
        onChange={ctl.setValue}
        onClose={ctl.closeAsk}
        onSubmit={() => void ctl.submit()}
      />
      <AddSheet
        ask={ctl.add}
        saving={ctl.saving}
        onChange={ctl.patchAdd}
        onClose={ctl.closeAdd}
        onSave={() => void ctl.submitAdd()}
      />
      <ItemSheet
        item={open}
        board={b?.title || UNTITLED_BOARD}
        tz={tz}
        saving={ctl.saving}
        canRemove={canEdit}
        onClose={() => setOpenId(null)}
        onRemove={(it) => {
          setOpenId(null);
          if (b) void ctl.removeReference(b.id, it);
        }}
      />
      <PkActions acts={acts} onClose={() => setActs(null)} />
    </div>
  );
}
