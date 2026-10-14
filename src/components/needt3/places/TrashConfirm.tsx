"use client";

import { useRef } from "react";

import { BoardDialog, DialogFoot, DialogHead } from "./board/parts";
import { trashAskText } from "./derive";
import type { TrashController } from "./useTrashController";

/**
 * The confirm before a permanent delete (one page, one moodboard, or Empty
 * Trash). It says there is no Undo, because there is none: Restore is the
 * reversible way out and stays a click away on the row.
 */
export function TrashConfirm({ c }: { c: TrashController }) {
  const { ask, setAsk, emptyCounts } = c;
  // The words stay drawn while the dialog slides away.
  const last = useRef<ReturnType<typeof trashAskText> | null>(null);
  if (ask) {
    last.current = trashAskText(
      ask.kind === "all" ? { kind: "all", ...emptyCounts } : ask
    );
  }
  const text = last.current;
  const close = () => setAsk(null);
  const go = () => {
    if (!ask) return;
    close();
    void c.runAsk(ask);
  };
  return (
    <BoardDialog
      open={!!ask}
      onClose={close}
      label={text?.title ?? "Delete forever"}
    >
      <DialogHead art="trash" title={text?.title ?? ""} sub={text?.body} />
      <DialogFoot>
        <button type="button" className="nx-btn nx-btn-text" onClick={close}>
          Cancel
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-danger"
          data-trash-confirm=""
          onClick={go}
        >
          {text?.confirm}
        </button>
      </DialogFoot>
    </BoardDialog>
  );
}
