"use client";

import { useEffect, useState } from "react";

import {
  connectPinterest,
  pinterestFailure,
  usePinterestBoards,
  usePinterestImport,
  usePinterestStatus,
} from "@/lib/needt3/hooks/pinterest";
import { notify } from "@/lib/notifications";

import { pinterestResultLine } from "./logic";
import { BoardDialog, DialogFoot, DialogHead } from "./parts";

/**
 * Import from Pinterest: connect (read-only), pick one of your boards, and its
 * Pins are copied onto this moodboard as pictures that keep their Pin link.
 * "Keep in sync" lets a daily pass add Pins that are new on Pinterest; it never
 * removes or changes anything here.
 */
export function PinterestDialog({
  open,
  moodboardId,
  linkedBoardId,
  syncing,
  onClose,
}: {
  open: boolean;
  moodboardId: string;
  /** The Pinterest board already linked to this moodboard, if any. */
  linkedBoardId: string | null;
  /** "Keep in sync" is on for the linked board. */
  syncing: boolean;
  onClose: () => void;
}) {
  const status = usePinterestStatus();
  const ready = !!status.data?.connected;
  const boards = usePinterestBoards(open && ready);
  const { importBoard, setKeepInSync } = usePinterestImport();
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setKeep(syncing);
      setBusy(null);
    }
  }, [open, syncing]);

  const failure = boards.error ? pinterestFailure(boards.error) : null;
  const needsConnect =
    status.data && (!status.data.connected || failure?.kind === "reconnect");

  const pick = async (id: string, name: string) => {
    if (busy) return;
    setBusy(id);
    try {
      const r = await importBoard(moodboardId, id, keep);
      notify.success(pinterestResultLine(r, name));
      onClose();
    } catch (error) {
      notify.error(pinterestFailure(error).message);
      setBusy(null);
    }
  };

  const toggle = async (on: boolean) => {
    setKeep(on);
    if (!linkedBoardId) return;
    try {
      await setKeepInSync(moodboardId, on);
      notify.success(on ? "Keeping in sync" : "Sync is off");
    } catch (error) {
      setKeep(!on);
      notify.error(pinterestFailure(error).message);
    }
  };

  return (
    <BoardDialog open={open} onClose={onClose} label="Import from Pinterest">
      <DialogHead
        art="stack"
        title="Import from Pinterest"
        sub="Read-only: Needt can’t create, edit or delete anything on Pinterest"
      />
      {status.isPending ? (
        <p className="pl-line">Checking Pinterest…</p>
      ) : needsConnect ? (
        <>
          <p className="pl-line">
            {status.data?.needsReconnect || failure?.kind === "reconnect"
              ? "Pinterest access ended. Connect again to keep importing."
              : "Connect your Pinterest account to pick a board. Needt asks to see your boards and Pins, nothing else."}
          </p>
          <DialogFoot>
            <button
              type="button"
              className="nx-btn nx-btn-text"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="nx-btn nx-btn-primary mb-pin-allow"
              onClick={() => connectPinterest(moodboardId)}
            >
              {status.data?.needsReconnect
                ? "Reconnect Pinterest"
                : "Connect Pinterest"}
            </button>
          </DialogFoot>
        </>
      ) : (
        <>
          {boards.isPending ? (
            <p className="pl-line">Loading your boards…</p>
          ) : failure ? (
            <p className="pl-line" role="alert">
              {failure.message}
            </p>
          ) : !boards.data?.length ? (
            <p className="pl-line">You have no boards on Pinterest yet.</p>
          ) : (
            <div className="pl-pinterest-sheet-col-3" role="list">
              {boards.data.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="listitem"
                  disabled={!!busy}
                  className="nx-press mb-pin-board pl-pinterest-sheet-row-5"
                  onClick={() => void pick(b.id, b.name)}
                >
                  <span className="pl-grow-col">
                    <span className="pl-strong">
                      {b.name}
                      {b.id === linkedBoardId ? " · linked" : ""}
                    </span>
                    <span className="pl-meta">
                      {busy === b.id
                        ? "Importing…"
                        : b.pinCount === null
                          ? "Pins"
                          : `${b.pinCount} ${b.pinCount === 1 ? "Pin" : "Pins"}`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <label className="pl-row-12">
            <input
              type="checkbox"
              checked={keep}
              disabled={!!busy}
              onChange={(e) => void toggle(e.target.checked)}
              aria-describedby="mb-pin-sync-hint"
            />
            <span className="pl-dlg-head-col">
              <span className="pl-strong">Keep in sync</span>
              <span id="mb-pin-sync-hint" className="pl-meta">
                Once a day, new Pins are added. Nothing is ever removed.
              </span>
            </span>
          </label>
          <DialogFoot>
            <button
              type="button"
              className="nx-btn nx-btn-text"
              onClick={onClose}
            >
              Close
            </button>
          </DialogFoot>
        </>
      )}
    </BoardDialog>
  );
}
