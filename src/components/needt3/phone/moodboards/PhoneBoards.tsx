"use client";

import { useState } from "react";

import {
  LuArrowUpRight,
  LuLock,
  LuPencil,
  LuPlus,
  LuTrash2,
} from "react-icons/lu";

import { useBoards } from "@/lib/needt3/hooks/boards";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import type { V3Board } from "@/lib/needt3/map";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import { isPrivateBoard } from "../../places/board/logic";
import type { BoardsController } from "../../places/useBoardsController";
import {
  PkActions,
  type PkActs,
  PkButton,
  PkEmpty,
  PkHold,
  PkScreen,
  PkSection,
} from "../kit";
import { usePhoneOverlays } from "../overlays/store";
import { PlaceState } from "../place-state/PlaceState";
import { NameSheet } from "./NameSheet";
import { BoardCover } from "./Wall";
import {
  BOARDS_PAYWALL_FEATURE,
  UNTITLED_BOARD,
  boardCountLine,
  boardMeta,
  boardQuota,
  cardMeta,
} from "./model";

const t = strings["phone-habits.jsx"];

function BoardCard({
  b,
  onOpen,
  onHold,
}: {
  b: V3Board;
  onOpen: (id: string) => void;
  onHold: (b: V3Board) => void;
}) {
  return (
    <PkHold
      className="phb-board-hold"
      onHold={() => onHold(b)}
      data={{ "data-phb-hold": b.id }}
    >
      <button
        type="button"
        className="phb-board"
        onClick={() => onOpen(b.id)}
        data-phb-board={b.id}
        aria-label={`${t.PhbBoardCard.open} ${b.title || UNTITLED_BOARD}`}
      >
        <span className="phb-board-cover">
          <BoardCover items={b.preview ?? []} />
        </span>
        <span className="phb-board-title">{b.title || UNTITLED_BOARD}</span>
        <span className="phb-board-meta">
          <span className="phb-board-count">{cardMeta(b)}</span>
          {isPrivateBoard({
            memberCount: b.memberCount,
            linkShare: b.linkShare,
          }) ? (
            <span className="phb-board-lock" title="Private — only you">
              <LuLock size={12} aria-hidden />
            </span>
          ) : null}
        </span>
      </button>
    </PkHold>
  );
}

/**
 * The boards list (phone-habits.jsx PhbBoards, the list half): a grid of
 * board cards with covers, a New chip, a pull-down that searches boards by
 * name and makes one on Enter, and hold-a-card for its actions. A board
 * opens at `/moodboards/[id]` (PhoneBoardPage).
 *
 * Free keeps FREE_BOARDS: the count is in the header and a new board past it
 * opens the paywall sheet. State is the controller's (`useBoardsController`).
 *
 * //todo: "Shared with you", the owner's name, member faces and "Leave board"
 * need the board's members and the caller's role: the list route sends
 * neither, and invite-by-email is MISSING (data map §7).
 */
export function PhoneBoards({ ctl }: { ctl: BoardsController }) {
  const boards = useBoards();
  const plan = usePlan();
  const tz = useTimeZone();
  const openPaywall = usePhoneOverlays((s) => s.openPaywall);
  const [acts, setActs] = useState<PkActs | null>(null);

  const live = (boards.data ?? []).filter((b) => !b.trashedAt);
  // Boards that are someone else's (shared with you) get their own section.
  const mine = live.filter(
    (b) => !b.accessRole || b.accessRole === "FULL_ACCESS"
  );
  const shared = live.filter(
    (b) => b.accessRole && b.accessRole !== "FULL_ACCESS"
  );
  const quota = boardQuota(plan.data?.kind, live.length);

  const holdActs = (b: V3Board) =>
    setActs({
      title: b.title || UNTITLED_BOARD,
      meta: boardMeta(b, tz),
      actions: [
        {
          label: t.PhbBoards.open,
          icon: <LuArrowUpRight size={18} aria-hidden />,
          glyph: "moodboards",
          onClick: () => ctl.open(b.id),
        },
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
          onClick: () => void ctl.remove(b),
          data: { "data-phb-act": "delete" },
        },
      ],
    });

  return (
    <div className="phb-mb" data-pk-screen="moodboards" data-phb-view="list">
      <div className="phb-mb-stage">
        <PkScreen
          screen="moodboards-list"
          title={t.PhbBoards.moodboards}
          glyph="moodboards"
          className="phb-mb-list"
          sub={boardCountLine(live.length)}
          head={
            quota.text ? (
              <div className="phb-head">
                <span className="phb-head-text" data-phb-quota={quota.text}>
                  {quota.text}
                  {quota.full ? (
                    <>
                      {" · "}
                      <PkButton
                        kind="inline"
                        onClick={() => openPaywall(BOARDS_PAYWALL_FEATURE)}
                        data-phb-upgrade
                      >
                        {strings["paywall.jsx"].ProLimit.upgrade_for_more}
                      </PkButton>
                    </>
                  ) : null}
                </span>
              </div>
            ) : null
          }
          right={
            <PkButton
              kind="chip"
              icon={<LuPlus size={16} aria-hidden />}
              onClick={ctl.openNew}
              aria-label={t.PhbBoards.new_board}
              data-phb-newboard
            >
              {t.PhbBoards.new}
            </PkButton>
          }
        >
          <PlaceState query={boards} screen="moodboards">
            {!live.length ? (
              <PkEmpty
                title={t.PhbBoards.no_boards_yet}
                line={t.PhbBoards.a_board_keeps_photos_links_colours_and_n}
                action={
                  <PkButton
                    kind="primary"
                    icon={<LuPlus size={16} aria-hidden />}
                    onClick={ctl.openNew}
                  >
                    {t.PhbBoards.new_board}
                  </PkButton>
                }
              />
            ) : (
              <>
                {mine.length ? (
                  <div className="phb-boards">
                    {mine.map((b) => (
                      <BoardCard
                        key={b.id}
                        b={b}
                        onOpen={ctl.open}
                        onHold={holdActs}
                      />
                    ))}
                  </div>
                ) : null}
                {shared.length ? (
                  <PkSection
                    title="Shared with you"
                    count={shared.length}
                    glyph="shared"
                    className="phb-shared"
                  >
                    <div className="phb-boards">
                      {shared.map((b) => (
                        <BoardCard
                          key={b.id}
                          b={b}
                          onOpen={ctl.open}
                          onHold={holdActs}
                        />
                      ))}
                    </div>
                  </PkSection>
                ) : null}
              </>
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
