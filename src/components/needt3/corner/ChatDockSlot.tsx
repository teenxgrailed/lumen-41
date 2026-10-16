"use client";

import { type Ref } from "react";

import { CHAT_DOCK_W } from "@/lib/assistant-position";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { useExit } from "../ctx/useExit";

/** The dock card's exit (chat.css v3-chat-spring-out 200ms, +20ms slack). */
export const PANEL_EXIT_MS = 220;

/**
 * The column Ask Needt docks into: the last child of the shell's main row
 * (prototype App.jsx `data-chat-dock`). It reads `askOpen` itself, so opening
 * the panel re-renders this one element and not the shell around it.
 *
 * The slot changes width in one step and never animates it: a width
 * transition re-lays-out the whole page beside it on every frame of the
 * panel's entrance, and that was the stutter. The card inside moves with
 * transform and opacity only (chat.css `v3-chat-spring-in`), over a slot that
 * already has the room. On the way out the slot waits for the card to leave
 * before it gives the width back.
 *
 * Below 1100 px the panel is a sheet over a scrim and the page keeps its
 * width; the phone draws its own Ask. The slot is always in the row so
 * opening it never moves the page's chain.
 */
export function ChatDockSlot({
  phone,
  narrow,
  slotRef,
}: {
  phone: boolean;
  narrow: boolean;
  slotRef: Ref<HTMLDivElement>;
}) {
  const asked = useNeedt3Ui((s) => s.askOpen);
  const [held] = useExit(asked && !phone && !narrow, PANEL_EXIT_MS);
  return (
    <div
      ref={slotRef}
      data-chat-dock
      style={
        narrow || phone
          ? { flex: "none", width: 0 }
          : {
              flex: "none",
              display: "flex",
              justifyContent: "flex-end",
              overflow: "hidden",
              backgroundColor: "var(--background)",
              width: held ? CHAT_DOCK_W : 0,
              contain: "layout paint",
            }
      }
    />
  );
}
