import { create } from "zustand";

import type { V3Task } from "@/lib/needt3/map";

/**
 * What the phone's shared sheets are showing. The composer and Ask live in
 * `useNeedt3Ui` (`composerOpen`, `askOpen`); the rest were local state of the
 * prototype's screens host (`V2pScreens`: `taskId`, the paywall flag, the
 * event) and have no flag there, so they are here: any phone screen opens
 * them by calling `openTask` / `openPaywall` / `openEvent`, and
 * `PhoneOverlays` draws them.
 *
 * //todo: fold into `src/store/needt3-ui.ts` if the integrator prefers one
 * store; nothing outside this folder reads these fields.
 */
export interface EventFacts {
  title: string;
  /** The day line under the title. */
  meta?: string | null;
  /** [label, value] pairs: Time, Length, Calendar, Overlaps. */
  facts: readonly (readonly [string, string])[];
}

/** A new event, from a tapped slot: local "YYYY-MM-DDTHH:mm" stamps. */
export interface NewEventDraft {
  title?: string;
  startAt: string;
  endAt: string;
}

export interface PhoneOverlayState {
  taskId: string | null;
  /** The task as the screen had it, so the sheet paints before any fetch. */
  taskSeed: V3Task | null;
  /** false, true, or the feature that asked ("Accent colours"). */
  paywall: boolean | string;
  event: EventFacts | null;
  newEvent: NewEventDraft | null;

  openTask: (task: V3Task | string) => void;
  closeTask: () => void;
  openPaywall: (feature?: string) => void;
  closePaywall: () => void;
  openEvent: (event: EventFacts) => void;
  closeEvent: () => void;
  openNewEvent: (draft: NewEventDraft) => void;
  closeNewEvent: () => void;
}

export const usePhoneOverlays = create<PhoneOverlayState>()((set) => ({
  taskId: null,
  taskSeed: null,
  paywall: false,
  event: null,
  newEvent: null,

  openTask: (task) =>
    set(
      typeof task === "string"
        ? { taskId: task, taskSeed: null }
        : { taskId: task.id, taskSeed: task }
    ),
  closeTask: () => set({ taskId: null }),
  openPaywall: (feature) => set({ paywall: feature || true }),
  closePaywall: () => set({ paywall: false }),
  openEvent: (event) => set({ event }),
  closeEvent: () => set({ event: null }),
  openNewEvent: (newEvent) => set({ newEvent }),
  closeNewEvent: () => set({ newEvent: null }),
}));
