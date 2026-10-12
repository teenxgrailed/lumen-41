"use client";

import { useCallback, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { findListItem } from "@/lib/needt3/hooks/core";
import { useTask } from "@/lib/needt3/hooks/tasks";
import type { V3Task } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { StoreAsk } from "./Ask";
import { StoreComposer } from "./Composer";
import { StoreEventSheet, StoreNewEventSheet } from "./EventSheet";
import { PkPaywall } from "./Paywall";
import { PkTaskSheet } from "./TaskSheet";
import { usePhoneOverlays } from "./store";

/** True from the first time `open` is true on: a sheet nobody opened costs nothing. */
function useOpenedOnce(open: boolean) {
  const [seen, setSeen] = useState(open);
  if (open && !seen) setSeen(true);
  return seen;
}

function TaskHost() {
  const qc = useQueryClient();
  const taskId = usePhoneOverlays((s) => s.taskId);
  const seed = usePhoneOverlays((s) => s.taskSeed);
  const close = usePhoneOverlays((s) => s.closeTask);
  const setFocusOpen = useNeedt3Ui((s) => s.setFocusOpen);
  const fetched = useTask(taskId).data;
  const cached = taskId
    ? findListItem<V3Task>(qc, qk.tasks(), taskId)
    : undefined;
  const task = taskId ? (fetched ?? seed ?? cached ?? null) : null;
  // //todo: "Start focus" opens the Focus window; what that is on the phone
  // is the shell's decision (P2).
  const onFocus = useCallback(() => {
    close();
    setFocusOpen(true);
  }, [close, setFocusOpen]);
  return (
    <PkTaskSheet task={task} open={!!task} onClose={close} onFocus={onFocus} />
  );
}

function PaywallHost() {
  const paywall = usePhoneOverlays((s) => s.paywall);
  const close = usePhoneOverlays((s) => s.closePaywall);
  const mounted = useOpenedOnce(!!paywall);
  const feature = useRef<string | null>(null);
  if (paywall) feature.current = typeof paywall === "string" ? paywall : null;
  if (!mounted) return null;
  return (
    <PkPaywall open={!!paywall} onClose={close} feature={feature.current} />
  );
}

function Lazy({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return useOpenedOnce(open) ? <>{children}</> : null;
}

/**
 * Every sheet that comes up over a phone screen, mounted once against its
 * flag; the phone shell renders this and nothing else of the overlays.
 *
 *   composer     `useNeedt3Ui().composerOpen`  (grows out of menu A's pill)
 *   Ask          `useNeedt3Ui().askOpen`
 *   task sheet   `usePhoneOverlays().openTask(task | id)`
 *   paywall      `usePhoneOverlays().openPaywall(feature?)`
 *   event        `usePhoneOverlays().openEvent(facts)` / `openNewEvent(slot)`
 *
 * Toasts are not here: `snack()` raises them through the `notify` facade.
 */
export function PhoneOverlays() {
  const composerOpen = useNeedt3Ui((s) => s.composerOpen);
  const askOpen = useNeedt3Ui((s) => s.askOpen);
  const event = usePhoneOverlays((s) => s.event);
  const newEvent = usePhoneOverlays((s) => s.newEvent);
  return (
    <>
      <Lazy open={composerOpen}>
        <StoreComposer />
      </Lazy>
      <Lazy open={askOpen}>
        <StoreAsk />
      </Lazy>
      <TaskHost />
      <PaywallHost />
      <Lazy open={!!event}>
        <StoreEventSheet />
      </Lazy>
      <Lazy open={!!newEvent}>
        <StoreNewEventSheet />
      </Lazy>
    </>
  );
}
