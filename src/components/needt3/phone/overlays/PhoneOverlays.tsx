"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { findListItem } from "@/lib/needt3/hooks/core";
import { useTask } from "@/lib/needt3/hooks/tasks";
import type { V3Task } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { useStartFocus } from "../../focus/useFocusController";
import { StoreAsk } from "./Ask";
import { StoreComposer } from "./Composer";
import { StoreEventSheet, StoreNewEventSheet } from "./EventSheet";
import { PkPaywall } from "./Paywall";
import { PkTaskSheet } from "./TaskSheet";
import { ScheduleSheet, useScheduleSheet } from "./schedule";
import { usePhoneOverlays } from "./store";

/** True from the first time `open` is true on: a sheet nobody opened costs nothing. */
function useOpenedOnce(open: boolean) {
  const [seen, setSeen] = useState(open);
  if (open && !seen) setSeen(true);
  return seen;
}

/**
 * True a moment after the shell has painted. The two sheets people open most
 * (New task, Ask) are mounted shut by then, so their first opening only slides
 * a tree that is already built: mounting it inside the rise stalled the first
 * frames. Nothing runs for a shut sheet (it is inert and hidden).
 */
function useIdleWarm() {
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setWarm(true), { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setWarm(true), 2500);
    return () => window.clearTimeout(id);
  }, []);
  return warm;
}

function TaskHost() {
  const qc = useQueryClient();
  const taskId = usePhoneOverlays((s) => s.taskId);
  const seed = usePhoneOverlays((s) => s.taskSeed);
  const close = usePhoneOverlays((s) => s.closeTask);
  const startFocus = useStartFocus();
  const fetched = useTask(taskId).data;
  const cached = taskId
    ? findListItem<V3Task>(qc, qk.tasks(), taskId)
    : undefined;
  const task = taskId ? (fetched ?? seed ?? cached ?? null) : null;
  // "Start focus": 25 minutes on this task; the Focus sheet opens on its clock.
  const onFocus = useCallback(() => {
    if (!task) return;
    close();
    void startFocus(task);
  }, [close, startFocus, task]);
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
  const scheduling = useScheduleSheet((s) => s.task);
  const warm = useIdleWarm();
  return (
    <>
      <Lazy open={composerOpen || warm}>
        <StoreComposer />
      </Lazy>
      <Lazy open={askOpen || warm}>
        <StoreAsk />
      </Lazy>
      <TaskHost />
      <Lazy open={!!scheduling}>
        <ScheduleSheet />
      </Lazy>
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
