"use client";

import { useRef } from "react";

import { type DayBand, bandTimeLabel } from "@/lib/personal-time-days";

import { BoardDialog, DialogFoot, DialogHead } from "../places/board/parts";

/** A task dropped into a block of personal time. */
export interface TaskInBandAsk {
  taskTitle: string;
  band: DayBand;
}

/** A band of a repeating block moved or resized: every repeat changes with it. */
export interface SeriesChangeAsk {
  series: {
    title: string;
    emoji: string;
    change: "move" | "resize";
    /** The weekdays (0 = Sunday) a move put the repeat on, when it changed day. */
    days?: number[];
  };
}

export type PersonalDropAsk = TaskInBandAsk | SeriesChangeAsk;

const WEEKDAYS = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

/** "Tuesdays", "Tuesdays and Thursdays", "Mondays, Wednesdays and Fridays". */
export function weekdayList(days: readonly number[]) {
  // Monday first, the way a week reads
  const names = [...days]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => WEEKDAYS[d]);
  return names.length > 1
    ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
    : (names[0] ?? "");
}

function words(ask: PersonalDropAsk) {
  if ("series" in ask) {
    const { title, emoji, change, days } = ask.series;
    return {
      label: "Change a repeating personal time",
      title: "This one repeats",
      sub:
        change === "move" && days?.length
          ? `${emoji} ${title} repeats, so every repeat moves with it and lands on ${weekdayList(days)}.`
          : `${emoji} ${title} repeats, so every repeat ${change === "move" ? "moves" : "changes"} with it.`,
      confirm: change === "move" ? "Move every repeat" : "Resize every repeat",
      kind: "series",
    };
  }
  return {
    label: "Place a task in personal time",
    title: "That time is yours",
    sub: `${ask.band.emoji} ${ask.band.title}, ${bandTimeLabel(ask.band)}, is kept for you. Place “${ask.taskTitle}” there anyway?`,
    confirm: "Place it anyway",
    kind: "task",
  };
}

/**
 * Asked when a task is dropped into personal time (the scheduler never puts a
 * task there, but the person may: this only checks that they meant to), and
 * when a repeating block is moved or resized (the whole series changes).
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
  const text = last.current ? words(last.current) : null;
  return (
    <BoardDialog
      open={!!ask}
      onClose={onCancel}
      label={text?.label ?? "Place a task in personal time"}
    >
      <DialogHead title={text?.title ?? "That time is yours"} sub={text?.sub} />
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
          data-pb-drop-kind={text?.kind}
          onClick={onConfirm}
        >
          {text?.confirm ?? "Place it anyway"}
        </button>
      </DialogFoot>
    </BoardDialog>
  );
}
