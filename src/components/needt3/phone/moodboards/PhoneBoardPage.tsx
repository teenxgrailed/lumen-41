"use client";

import { useRef, useState } from "react";

import { useSession } from "next-auth/react";

import {
  LuArrowUpRight,
  LuChevronLeft,
  LuCopy,
  LuEllipsis,
  LuLock,
  LuLogOut,
  LuPencil,
  LuPlus,
  LuShare2,
  LuToggleLeft,
  LuTrash2,
  LuUsers,
} from "react-icons/lu";

import { useBoardAccess } from "@/lib/needt3/hooks/board-share";
import { useBoard, useBoardItems, useBoards } from "@/lib/needt3/hooks/boards";
import { useCatalog } from "@/lib/needt3/hooks/catalog";
import { usePinterestStatus } from "@/lib/needt3/hooks/pinterest";
import { useTimeZone } from "@/lib/needt3/hooks/settings";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import { openPaywall } from "../../paywall/store";
import { copyText, openUrl } from "../../places/board/clipboard";
import { canManage, sourceUrlOf } from "../../places/board/logic";
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
import { PinterestSheet } from "./PinterestSheet";
import { ShareSheet } from "./ShareSheet";
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
 * and title, Add, Share (People for a guest of the board) and the board's
 * actions, and the wall of references read from `/api/moodboards/[id]/items`
 * (skeleton while they load, the error row with Retry if they fail).
 *
 * Everything writes through the controller: add a photo (shrunk to JPEG
 * ≤ 900 px and uploaded), link, colour, note; edit a title, note or colour in
 * the item sheet; hold a tile to lift and drag it (or "Move to top");
 * remove; rename, delete (to Trash) for full access, leave for a guest of the
 * board; Share. All with Undo except Leave.
 * //todo: Move to board (a cross-board move route), Pinterest (no connection).
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
  const { data: session } = useSession();
  const access = useBoardAccess(id);
  const fileInput = useRef<HTMLInputElement>(null);
  const pin = usePinterestStatus().data;
  const isAdmin = !!useCatalog().data?.isAdmin;
  const [pinOpen, setPinOpen] = useState(false);
  const [acts, setActs] = useState<PkActs | null>(null);
  const one = useBoard(id);
  const listed = (boards.data ?? []).find((x) => x.id === id && !x.trashedAt);
  /* The list does not send the caller's role on older servers; the single-board
     read does. Until one says EDITOR or above, nothing that writes is shown. */
  const b = listed
    ? { ...listed, accessRole: one.data?.accessRole ?? listed.accessRole }
    : undefined;
  const canEdit = canEditBoard(b);
  const owner = canManage(b?.accessRole);
  const items: readonly PhoneBoardItem[] = itemsQuery.data ?? [];
  const open = items.find((x) => x.id === ctl.detailId) ?? null;
  const onBoard =
    !!session?.user?.id &&
    !!access.data?.grants.some((g) => g.userId === session.user?.id);
  const others = listed?.memberCount ?? 0;

  const pickPhotos = () => fileInput.current?.click();

  const options = () => {
    if (!b) return;
    setActs({
      title: b.title || UNTITLED_BOARD,
      meta: referenceCount(items.length),
      actions: [
        canEdit
          ? {
              label: t.PhbBoards.rename,
              icon: <LuPencil size={18} aria-hidden />,
              hue: "var(--v2p-lav)",
              onClick: () => ctl.openRename(b),
              data: { "data-phb-act": "rename" },
            }
          : null,
        {
          label: owner ? "Share…" : "People",
          hint: owner ? "Invite, roles, the link" : "Who is on this board",
          icon: <LuUsers size={18} aria-hidden />,
          hue: "var(--info)",
          onClick: () => ctl.openSheet("share"),
          data: { "data-phb-act": "share" },
        },
        owner
          ? {
              label: t.PhbBoards.delete_board,
              hint: t.PhbBoards.kept_in_trash_for_30_days,
              icon: <LuTrash2 size={18} aria-hidden />,
              danger: true,
              onClick: () => void ctl.remove(b, true),
              data: { "data-phb-act": "delete" },
            }
          : onBoard && session?.user?.id
            ? {
                label: "Leave board",
                icon: <LuLogOut size={18} aria-hidden />,
                danger: true,
                onClick: () =>
                  void ctl.leave(b, {
                    userId: session.user?.id as string,
                    name: session.user?.name ?? null,
                    email: session.user?.email ?? null,
                    image: session.user?.image ?? null,
                  }),
                data: { "data-phb-act": "leave" },
              }
            : null,
      ],
    });
  };

  /** The long-press menu of one tile. */
  const itemActs = (it: PhoneBoardItem) => {
    const web = sourceUrlOf(it);
    const first = items.find((x) => !x.fromCanvas);
    setActs({
      title: itemName(it),
      meta: it.kind,
      actions: [
        {
          label: canEdit && !it.fromCanvas ? "Open and edit" : "Open",
          icon: <LuPencil size={18} aria-hidden />,
          hue: "var(--hue-blue)",
          onClick: () => ctl.openDetail(it.id),
          data: { "data-phb-act": "open" },
        },
        canEdit && !it.fromCanvas && first && first.id !== it.id
          ? {
              label: "Move to top",
              icon: <LuToggleLeft size={18} aria-hidden />,
              hue: "var(--v2p-lav)",
              onClick: () => void ctl.moveToTop(id, it.id),
              data: { "data-phb-act": "top" },
            }
          : null,
        web
          ? {
              label: `Open ${it.source?.domain || "link"}`,
              icon: <LuArrowUpRight size={18} aria-hidden />,
              hue: "var(--info)",
              onClick: () => openUrl(web as string),
            }
          : null,
        it.kind === "color" && it.color
          ? {
              label: `Copy ${it.color.toUpperCase()}`,
              icon: <LuCopy size={18} aria-hidden />,
              hue: "var(--hue-pink)",
              onClick: () =>
                void copyText(
                  (it.color as string).toUpperCase(),
                  `Copied ${(it.color as string).toUpperCase()}`
                ),
            }
          : null,
        canEdit && !it.fromCanvas
          ? {
              label: "Remove from board",
              icon: <LuTrash2 size={18} aria-hidden />,
              danger: true,
              onClick: () => void ctl.removeReference(id, it),
              data: { "data-phb-act": "remove" },
            }
          : null,
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
    onPick: (hit: { id: string }) => ctl.openDetail(hit.id),
    placeholder: t.PhbBoardPage.search_this_board,
    hint: t.PhbBoardPage.titles_notes_colours_and_sites_on_this_b,
  };

  const who = !b ? null : !owner ? (
    <span className="phb-bh-who">
      {listed?.owner?.name ? `${listed.owner.name}’s board · ` : ""}you can{" "}
      {canEdit ? "edit" : "view"}
    </span>
  ) : others ? (
    <span className="phb-bh-who">Shared with {others}</span>
  ) : (
    <span className="phb-bh-who">
      <LuLock size={12} aria-hidden />
      {b.linkShare ? "Anyone with the link" : "Only you"}
    </span>
  );

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
        {who}
      </p>
      <div className="phb-bh-acts">
        {canEdit ? (
          <PkButton
            kind="primary"
            small
            icon={<LuPlus size={16} aria-hidden />}
            onClick={() => ctl.openAdd(b.id)}
            data-phb-add
          >
            {t.PhbBoardPage.add}
          </PkButton>
        ) : null}
        <PkGlass
          as="button"
          round
          className="phb-gbtn"
          onClick={() => ctl.openSheet("share")}
          aria-label={owner ? "Share" : "People"}
          data-phb-share
        >
          {owner ? (
            <LuShare2 size={16} aria-hidden />
          ) : (
            <LuUsers size={16} aria-hidden />
          )}
          <span>{owner ? "Share" : "People"}</span>
        </PkGlass>
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
                  <Wall
                    items={items}
                    canEdit={canEdit}
                    onOpen={(it) => ctl.openDetail(it.id)}
                    onHold={itemActs}
                    onOrder={(order) => ctl.reorder(id, order)}
                  />
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
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label="Photos"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void ctl.addFiles(id, files);
        }}
      />
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
        onPhoto={() => {
          // The picker opens inside this tap, then the sheet slides away.
          pickPhotos();
          ctl.closeAdd();
        }}
        pinterest={
          !pin || (!pin.configured && !isAdmin)
            ? undefined
            : {
                mode: !pin.configured ? "unset" : pin.pro ? "ready" : "locked",
                onPick: () => {
                  ctl.closeAdd();
                  if (pin.pro) setPinOpen(true);
                  else openPaywall("Pinterest boards");
                },
              }
        }
      />
      <PinterestSheet
        open={pinOpen}
        moodboardId={id}
        linkedBoardId={b?.pinterestBoardId ?? null}
        syncing={!!b?.pinterestSync}
        onClose={() => setPinOpen(false)}
      />
      <ItemSheet
        item={open}
        board={b?.title || UNTITLED_BOARD}
        boardId={id}
        canModerate={owner}
        tz={tz}
        saving={ctl.saving}
        canEdit={canEdit}
        onClose={ctl.closeDetail}
        onSave={(it, patch) => void ctl.saveItem(id, it.id, patch)}
        onRemove={(it) => {
          ctl.closeDetail();
          if (b) void ctl.removeReference(b.id, it);
        }}
      />
      <ShareSheet
        boardId={id}
        title={b?.title || UNTITLED_BOARD}
        open={ctl.sheet === "share" && !!b}
        onClose={ctl.closeSheet}
        onLinkShare={(on) => ctl.setLinkShare(id, on)}
      />
      <PkActions acts={acts} onClose={() => setActs(null)} />
    </div>
  );
}
