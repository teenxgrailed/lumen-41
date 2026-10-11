"use client";

import { useState } from "react";

import { LuChevronLeft, LuEllipsis, LuPencil, LuTrash2 } from "react-icons/lu";

import { useBoards } from "@/lib/needt3/hooks/boards";
import { useTimeZone } from "@/lib/needt3/hooks/settings";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
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
import { NameSheet } from "./NameSheet";
import { Wall } from "./Wall";
import { type PhoneBoardItem, UNTITLED_BOARD, madeLine } from "./model";
import type { PhoneBoardsController } from "./usePhoneBoards";

const t = strings["phone-habits.jsx"];

/**
 * One board (phone-habits.jsx PhbBoardPage): the back chip, the board's glyph
 * and title, its actions, and the wall of references.
 *
 * Written only where a route exists: rename and delete (to Trash, with Undo)
 * go through `/api/moodboards/[id]`. The references themselves have no route
 * (data map §7: `MoodboardItem` items CRUD is MISSING), so the wall has
 * nothing to read and says so instead of drawing an empty board that may not
 * be empty; Add, Share (invite by email), Pinterest, tile details, Move,
 * Remove and the hold-to-lift reorder wait for that route.
 */
export function PhoneBoardPage({
  ctl,
  id,
  items = null,
}: {
  ctl: PhoneBoardsController;
  id: string;
  /** The board's references; null = they cannot be read yet (no route). */
  items?: readonly PhoneBoardItem[] | null;
}) {
  const boards = useBoards();
  const tz = useTimeZone();
  const [acts, setActs] = useState<PkActs | null>(null);
  const b = (boards.data ?? []).find((x) => x.id === id && !x.trashedAt);

  const options = () => {
    if (!b) return;
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
      <p className="pk-sub phb-bh-sub">{madeLine(b.createdAt, tz)}</p>
      <div className="phb-bh-acts">
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
            ) : items === null ? (
              <PkEmpty
                sky={false}
                title="References are not available yet"
                line="This board keeps its photos, links, colours and notes, but the phone cannot read them yet."
              />
            ) : items.length ? (
              <Wall items={items} />
            ) : (
              <PkEmpty
                title={t.PhbBoardPage.nothing_on_this_board_yet}
                line={t.PhbBoardPage.photos_links_colours_and_notes_whatever_}
              />
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
      <PkActions acts={acts} onClose={() => setActs(null)} />
    </div>
  );
}
