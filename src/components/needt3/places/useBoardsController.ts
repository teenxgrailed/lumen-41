"use client";

import { useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { useQueryClient } from "@tanstack/react-query";

import { moveId, sameOrder } from "@/lib/needt3/board-order";
import {
  type BoardPerson,
  boardAccessKey,
  useSetBoardGrant,
} from "@/lib/needt3/hooks/board-share";
import {
  type BoardItemDraft,
  type BoardItemPatch,
  type V3BoardItem,
  boardItemsKey,
  useAddBoardItem,
  useCreateBoard,
  useRemoveBoardItem,
  useReorderBoardItems,
  useTrashBoard,
  useUpdateBoard,
  useUpdateBoardItem,
} from "@/lib/needt3/hooks/boards";
import { isBoardFull, isUploadRefusal } from "@/lib/needt3/hooks/core";
import type { V3Plan } from "@/lib/needt3/hooks/plan";
import type { V3Board } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import {
  type AddAsk,
  type NameAsk,
  UNTITLED_BOARD,
  addDraft,
  blankAdd,
  boardQuota,
  nameOk,
  renameChanges,
} from "../phone/moodboards/model";
import { snack } from "../phone/overlays/snack";
import { downscaleImage } from "./board/downscale";
import { isImageFile, linkDraft, linkFromUrl, normHex } from "./board/logic";
import { BOARD_FULL_TEXT, BOARD_ITEM_LIMIT } from "./derive";

/** The dialogs the desktop board page opens (the phone has its own sheets). */
export type BoardSheet =
  | "link"
  | "colour"
  | "note"
  | "share"
  | "pinterest"
  | null;

/** The place's list route; a board is one level under it. */
export const BOARDS_PATH = "/moodboards";

export interface BoardsControllerOptions {
  /**
   * A new board was refused by the Free allowance. The phone opens the
   * paywall sheet; the desktop shows its notice. The route knows which face
   * is drawn, so it passes this (read at the moment of the tap).
   */
  onBlocked: () => void;
}

/**
 * What the Moodboards screens hold, called ONCE by the route component above
 * the phone / desktop face switch and handed to BOTH faces (round-2 rule: two
 * faces, one state). The naming sheet and what is typed into it, and the
 * in-flight create / rename / delete live here, so crossing 700 px keeps the
 * draft and a board is never created twice by a swap. It owns no query: the
 * Free allowance is read from the cache at the moment of the tap
 * (`quota()`), so the faces read the data themselves.
 *
 * A board's references (add, upload, edit, remove, reorder) and its Share
 * sheet go through the items and permissions routes; the page's own UI state
 * (the open reference, the open dialog, "View as guest") is here too, so a
 * resize across 700 px keeps it.
 */
export function useBoardsController(opts: BoardsControllerOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const router = useRouter();
  const qc = useQueryClient();
  const create = useCreateBoard();
  const update = useUpdateBoard();
  const trash = useTrashBoard();
  const addItem = useAddBoardItem();
  const removeItem = useRemoveBoardItem();
  const updateItem = useUpdateBoardItem();
  const reorderItems = useReorderBoardItems();
  const setGrant = useSetBoardGrant();

  const [ask, setAsk] = useState<NameAsk | null>(null);
  const [add, setAdd] = useState<AddAsk | null>(null);
  const [saving, setSaving] = useState(false);
  /* The board page's own state: the open reference, the open dialog, guest view. */
  const [detailId, setDetailId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<BoardSheet>(null);
  const [guest, setGuest] = useState(false);
  /* A second tap before the first write settles must write nothing. */
  const busy = useRef(false);

  /** The Free board allowance as it stands now (cache, not a subscription). */
  const quota = () => {
    // Whichever sort of the list is cached (the grid's, or the default one).
    const boards = qc
      .getQueriesData<V3Board[]>({ queryKey: qk.boards() })
      .map(([, list]) => list)
      .find((list): list is V3Board[] => Array.isArray(list));
    const plan = qc.getQueryData<V3Plan>(qk.plan());
    const live = (boards ?? []).filter((b) => !b.trashedAt).length;
    return boardQuota(plan?.kind, live);
  };

  /** A new board past the Free allowance goes to the paywall, not the sheet. */
  const blocked = () => {
    if (!quota().atLimit) return false;
    optsRef.current.onBlocked();
    return true;
  };

  const open = (id: string) => router.push(`${BOARDS_PATH}/${id}`);
  const back = () => router.push(BOARDS_PATH);

  const openNew = () => {
    if (blocked()) return;
    setAsk({ mode: "new", id: null, value: "", was: "" });
  };
  const openRename = (b: Pick<V3Board, "id" | "title">) =>
    setAsk({ mode: "rename", id: b.id, value: b.title, was: b.title });
  const closeAsk = () => setAsk(null);
  const setValue = (value: string) => setAsk((a) => (a ? { ...a, value } : a));

  /** Make a board and open it. The title comes from the sheet or the pull-down. */
  const make = async (
    title: string,
    madeMessage?: (name: string) => string
  ) => {
    if (busy.current || blocked()) return false;
    busy.current = true;
    setSaving(true);
    const name = title.trim() || UNTITLED_BOARD;
    try {
      const made = await create.mutateAsync({ draft: { title: name } });
      if (!made.result) return false;
      snack(
        madeMessage ? madeMessage(name) : `Board “${name}” made`,
        made.undo
      );
      setAsk(null);
      open(made.result.id);
      return true;
    } catch {
      return false; // the hook told the person; the sheet and the text stay
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const rename = async (id: string, title: string) => {
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    try {
      const { undo } = await update.mutateAsync({ id, patch: { title } });
      snack(`Renamed to “${title}”`, undo);
      setAsk(null);
      return true;
    } catch {
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  /** The naming sheet's Create / Save. */
  const submit = async () => {
    const a = ask;
    if (!a || !nameOk(a.value)) return;
    if (a.mode === "new") {
      await make(a.value);
      return;
    }
    if (!a.id) return;
    if (!renameChanges(a)) {
      setAsk(null);
      return;
    }
    await rename(a.id, a.value.trim());
  };

  /** Delete = move to Trash, kept 30 days, with Undo. */
  const remove = async (b: Pick<V3Board, "id" | "title">, leave = false) => {
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    try {
      const gone = await trash.mutateAsync({ id: b.id, trashed: true });
      snack(`“${b.title || UNTITLED_BOARD}” moved to Trash`, gone.undo);
      if (leave) back();
      return true;
    } catch {
      return false; // the hook told the person and put the board back
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  /** The references the caller's cache holds for a board (own rows, not canvas tiles). */
  const ownItems = (boardId: string) =>
    (qc.getQueryData<V3BoardItem[]>(boardItemsKey(boardId)) ?? []).filter(
      (i) => !i.fromCanvas
    );

  /** A position that puts a new reference first (the prototype adds to the front). */
  const frontPosition = (boardId: string, count = 1) => {
    const list = ownItems(boardId);
    const lowest = list.length ? Math.min(...list.map((i) => i.position)) : 1;
    return lowest - count;
  };

  /* ── a board's references (the items routes) ── */

  const openAdd = (boardId: string) => setAdd(blankAdd(boardId));
  const closeAdd = () => setAdd(null);
  const patchAdd = (p: Partial<AddAsk>) =>
    setAdd((a) => (a ? { ...a, ...p } : a));

  /** Save the add sheet's link / colour / note to the end of the wall. */
  const submitAdd = async () => {
    const a = add;
    if (!a || busy.current) return false;
    const draft = addDraft(a);
    if (!draft) return false;
    busy.current = true;
    setSaving(true);
    try {
      const { undo } = await addItem.mutateAsync({
        boardId: a.boardId,
        draft: { ...draft, position: frontPosition(a.boardId) },
      });
      snack("Added to this board", undo);
      setAdd(null);
      return true;
    } catch (error) {
      /* The hook told the person, except for a full board (409), which is
         answered here; the sheet and the text stay either way. */
      if (isBoardFull(error)) notify.info(BOARD_FULL_TEXT);
      else if (isUploadRefusal(error)) notify.error(error.message);
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  /** Remove a reference from the board, with Undo (it comes back in place). */
  const removeReference = async (boardId: string, item: V3BoardItem) => {
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    try {
      const { undo } = await removeItem.mutateAsync({ boardId, id: item.id });
      snack("Reference removed", undo);
      return true;
    } catch {
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  /* ── adding to a board's wall ── */

  /** Add one link / colour / note at the front, with Undo. */
  const addReference = async (
    boardId: string,
    draft: BoardItemDraft,
    message = "Added to this board"
  ) => {
    if (busy.current) return false;
    if (ownItems(boardId).length >= BOARD_ITEM_LIMIT) {
      notify.info(BOARD_FULL_TEXT);
      return false;
    }
    busy.current = true;
    setSaving(true);
    try {
      const { undo } = await addItem.mutateAsync({
        boardId,
        draft: { ...draft, position: frontPosition(boardId) },
      });
      snack(message, undo);
      return true;
    } catch (error) {
      if (isBoardFull(error)) notify.info(BOARD_FULL_TEXT);
      else if (isUploadRefusal(error)) notify.error(error.message);
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  /** A pasted or typed address; false when it is not a link. The server adds the page's own title and picture. */
  const addLink = async (boardId: string, raw: string) => {
    const link = linkFromUrl(raw);
    if (!link) return false;
    return addReference(
      boardId,
      linkDraft(link),
      `${/figma\.com$/.test(link.domain) ? "Figma link" : "Link"} added · ${link.domain}`
    );
  };

  const addColour = (boardId: string, hex: string, name = "") => {
    const color = normHex(hex);
    if (!color) return Promise.resolve(false);
    return addReference(
      boardId,
      { kind: "color", color, colorName: name.trim() || null, ratio: 0.8 },
      "Colour added"
    );
  };

  const addNote = (boardId: string, text: string) => {
    const t = text.trim();
    if (!t) return Promise.resolve(false);
    return addReference(
      boardId,
      { kind: "note", text: t, ratio: Math.min(1.4, 0.5 + t.length / 160) },
      "Note added"
    );
  };

  /**
   * Pictures (Upload, drop, paste, the phone's Photos): each is shrunk to a
   * JPEG of at most 900 px in the browser and uploaded; one notice with one
   * Undo covers the batch. Files over what the board can still hold are left
   * out with a notice.
   */
  const addFiles = async (boardId: string, picked: readonly File[]) => {
    const files = picked.filter(isImageFile);
    if (!files.length) {
      notify.info("Only images can be dropped here");
      return false;
    }
    if (busy.current) return false;
    const room = BOARD_ITEM_LIMIT - ownItems(boardId).length;
    if (room <= 0) {
      notify.info(BOARD_FULL_TEXT);
      return false;
    }
    busy.current = true;
    setSaving(true);
    const undos: (() => Promise<void>)[] = [];
    try {
      const drafts = (
        await Promise.all(files.slice(0, room).map(downscaleImage))
      ).filter((d): d is NonNullable<typeof d> => !!d);
      if (!drafts.length) {
        notify.info("Couldn’t read that image");
        return false;
      }
      const first = frontPosition(boardId, drafts.length);
      for (const [k, upload] of drafts.entries()) {
        const { undo } = await addItem.mutateAsync({
          boardId,
          upload: { ...upload, position: first + k },
        });
        undos.push(undo);
      }
      if (files.length > room) notify.info(BOARD_FULL_TEXT);
      snack(
        `${undos.length} ${undos.length > 1 ? "images" : "image"} added`,
        async () => {
          for (const u of undos) await u();
        }
      );
      return true;
    } catch (error) {
      if (isBoardFull(error)) notify.info(BOARD_FULL_TEXT);
      else if (isUploadRefusal(error)) notify.error(error.message);
      // Whatever went up before the failure is kept; the hook told the person.
      if (undos.length)
        snack(`${undos.length} added before it stopped`, async () => {
          for (const u of undos) await u();
        });
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  /** Autosave a reference's caption, note, title or colour; nothing is said (the field says "Saved"). */
  const saveItem = async (
    boardId: string,
    id: string,
    patch: BoardItemPatch
  ) => {
    if (id.startsWith("canvas:")) return false;
    try {
      await updateItem.mutateAsync({ boardId, id, patch });
      return true;
    } catch {
      return false; // the hook told the person and put the old fields back
    }
  };

  /** Drag a reference to a place in the wall (its index among the board's own references). */
  const moveItemTo = async (boardId: string, id: string, toIndex: number) => {
    const ids = ownItems(boardId).map((i) => i.id);
    const next = moveId(ids, id, toIndex);
    if (sameOrder(ids, next)) return false;
    return reorder(boardId, next);
  };

  /** Put the references in this order (all of the board's own ids, new order). Undo restores it. */
  const reorder = async (boardId: string, order: string[]) => {
    try {
      const { undo } = await reorderItems.mutateAsync({ boardId, order });
      snack("Order changed", undo);
      return true;
    } catch {
      return false;
    }
  };

  /** "Move to top". */
  const moveToTop = (boardId: string, id: string) => moveItemTo(boardId, id, 0);

  /**
   * Take yourself off a board that is not yours (phone: Leave board). The
   * server lets anyone remove their own access; getting it back needs the
   * owner, so there is no Undo.
   */
  const leave = async (b: Pick<V3Board, "id" | "title">, me: BoardPerson) => {
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    try {
      await setGrant.mutateAsync({ boardId: b.id, person: me, role: null });
      void qc.invalidateQueries({ queryKey: qk.boards() });
      snack(`You left “${b.title || UNTITLED_BOARD}”`);
      back();
      return true;
    } catch {
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  /** "Anyone with the link" on or off; the server needs full access. */
  const setLinkShare = async (boardId: string, on: boolean) => {
    try {
      await update.mutateAsync({ id: boardId, patch: { linkShare: on } });
      // The Share dialog reads linkShare from the access query first; it only
      // refetches on open, so without this it keeps saying "Private".
      void qc.invalidateQueries({ queryKey: boardAccessKey(boardId) });
      notify.success(on ? "Anyone with the link can view" : "Link sharing off");
      return true;
    } catch {
      return false;
    }
  };

  return {
    ask,
    add,
    detailId,
    openDetail: setDetailId,
    closeDetail: () => setDetailId(null),
    sheet,
    openSheet: setSheet,
    closeSheet: () => setSheet(null),
    guest,
    setGuest,
    addReference,
    addLink,
    addColour,
    addNote,
    addFiles,
    saveItem,
    moveItemTo,
    moveToTop,
    reorder,
    setLinkShare,
    leave,
    openAdd,
    closeAdd,
    patchAdd,
    submitAdd,
    removeReference,
    saving,
    rename,
    open,
    back,
    openNew,
    openRename,
    closeAsk,
    setValue,
    make,
    submit,
    remove,
    quota,
  };
}

export type BoardsController = ReturnType<typeof useBoardsController>;
