"use client";

import { useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { useQueryClient } from "@tanstack/react-query";

import {
  useCreateBoard,
  useTrashBoard,
  useUpdateBoard,
} from "@/lib/needt3/hooks/boards";
import type { V3Plan } from "@/lib/needt3/hooks/plan";
import type { V3Board } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";

import {
  type NameAsk,
  UNTITLED_BOARD,
  boardQuota,
  nameOk,
  renameChanges,
} from "../phone/moodboards/model";
import { snack } from "../phone/overlays/snack";

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
 * A board's references have no API route yet (data map §7: `MoodboardItem`
 * items CRUD is MISSING), so add / remove / move / reorder are not here.
 */
export function useBoardsController(opts: BoardsControllerOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const router = useRouter();
  const qc = useQueryClient();
  const create = useCreateBoard();
  const update = useUpdateBoard();
  const trash = useTrashBoard();

  const [ask, setAsk] = useState<NameAsk | null>(null);
  const [saving, setSaving] = useState(false);
  /* A second tap before the first write settles must write nothing. */
  const busy = useRef(false);

  /** The Free board allowance as it stands now (cache, not a subscription). */
  const quota = () => {
    const boards = qc.getQueryData<V3Board[]>(qk.boards());
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
    try {
      const gone = await trash.mutateAsync({ id: b.id, trashed: true });
      snack(`“${b.title || UNTITLED_BOARD}” moved to Trash`, gone.undo);
      if (leave) back();
    } catch {
      /* the hook told the person and put the board back */
    }
  };

  return {
    ask,
    saving,
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
