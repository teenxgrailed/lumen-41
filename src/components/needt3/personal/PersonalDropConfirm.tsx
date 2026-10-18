"use client";

import { useRef } from "react";

import { type DayBand, bandTimeLabel } from "@/lib/personal-time-days";

import { BoardDialog, DialogFoot, DialogHead } from "../places/board/parts";

export interface PersonalDropAsk {
  taskTitle: string;
  band: DayBand;
}

/**
 * Asked when a task is dropped into personal time. The scheduler never puts a
 * task there, but the person may: this only checks that they meant to.
 */
export function PersonalDropConfirm({
  ask,
  onConfirm,
  onCancel,
}: {
  ask: PersonalDropAsk | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // The words stay drawn while the dialog slides away.
  const last = useRef<PersonalDropAsk | null>(null);
  if (ask) last.current = ask;
  const text = last.current;
  return (
    <BoardDialog
      open={!!ask}
      onClose={onCancel}
      label="Place a task in personal time"
    >
      <DialogHead
        title="That time is yours"
        sub={
          text
            ? `${text.band.emoji} ${text.band.title}, ${bandTimeLabel(text.band)}, is kept for you. Place “${text.taskTitle}” there anyway?`
            : undefined
        }
      />
      <DialogFoot>
        <button
          type="button"
          className="nx-btn nx-btn-text"
          data-pb-drop-cancel=""
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-secondary"
          data-pb-drop-confirm=""
          onClick={onConfirm}
        >
          Place it anyway
        </button>
      </DialogFoot>
    </BoardDialog>
  );
}
