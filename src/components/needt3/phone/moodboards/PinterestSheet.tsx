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

import { pinterestResultLine } from "../../places/board/logic";
import { PkButton, PkGlass, PkSheet } from "../kit";

/**
 * Import from Pinterest on the phone: connect (read-only), pick a board, its
 * Pins are copied onto this moodboard. "Keep in sync" adds new Pins once a
 * day and never removes anything.
 */
export function PinterestSheet({
  open,
  moodboardId,
  linkedBoardId,
  syncing,
  onClose,
}: {
  open: boolean;
  moodboardId: string;
  linkedBoardId: string | null;
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
    !!status.data && (!status.data.connected || failure?.kind === "reconnect");

  const pick = async (id: string, name: string) => {
    if (busy) return;
    setBusy(id);
    try {
      notify.success(
        pinterestResultLine(await importBoard(moodboardId, id, keep), name)
      );
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
    } catch (error) {
      setKeep(!on);
      notify.error(pinterestFailure(error).message);
    }
  };

  return (
    <PkSheet
      open={open}
      onClose={onClose}
      title="Import from Pinterest"
      label="Import from Pinterest"
      className="phb-add-sheet"
      footer={
        needsConnect ? (
          <>
            <PkButton onClick={onClose}>Cancel</PkButton>
            <PkButton
              kind="primary"
              onClick={() => connectPinterest(moodboardId)}
            >
              {status.data?.needsReconnect ? "Reconnect" : "Connect"}
            </PkButton>
          </>
        ) : null
      }
    >
      {status.isPending ? (
        <p className="phb-kind-hint">Checking Pinterest…</p>
      ) : needsConnect ? (
        <p className="phb-kind-hint">
          {status.data?.needsReconnect || failure?.kind === "reconnect"
            ? "Pinterest access ended. Connect again to keep importing."
            : "Connect Pinterest to pick a board. Needt only reads your boards and Pins."}
        </p>
      ) : boards.isPending ? (
        <p className="phb-kind-hint">Loading your boards…</p>
      ) : failure ? (
        <p className="phb-err" role="alert">
          {failure.message}
        </p>
      ) : (
        <div className="phb-kinds" role="menu">
          {(boards.data ?? []).map((b) => (
            <PkGlass
              key={b.id}
              as="button"
              className="phb-kind"
              role="menuitem"
              disabled={!!busy}
              onClick={() => void pick(b.id, b.name)}
            >
              <span className="phb-kind-text">
                <span className="phb-kind-label">
                  {b.name}
                  {b.id === linkedBoardId ? " · linked" : ""}
                </span>
                <span className="phb-kind-hint">
                  {busy === b.id
                    ? "Importing…"
                    : b.pinCount === null
                      ? "Pins"
                      : `${b.pinCount} ${b.pinCount === 1 ? "Pin" : "Pins"}`}
                </span>
              </span>
            </PkGlass>
          ))}
          {!boards.data?.length ? (
            <p className="phb-kind-hint">
              You have no boards on Pinterest yet.
            </p>
          ) : null}
          <label className="phb-kind-hint">
            <input
              type="checkbox"
              checked={keep}
              disabled={!!busy}
              onChange={(e) => void toggle(e.target.checked)}
            />{" "}
            Keep in sync — new Pins are added once a day, nothing is removed
          </label>
        </div>
      )}
    </PkSheet>
  );
}
