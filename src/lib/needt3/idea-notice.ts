/* IDEA CARDS, the one line. When the idea sweep moves tasks to Ideas the open
   app hears one `idea-cards` realtime event and shows a single notice, "Moved 3
   to Ideas: ...", with Undo. Undo reverses every conversion of that run, newest
   first (`POST /api/agent/runs/:id/undo`); a run that stopped at a conflict, or
   a failed call, says so instead of failing silently. Copy only: the notice is
   the shared `notify` pill, drawn by the design chat's ActionToasts. */
import { create } from "zustand";

import { notify } from "@/lib/notifications";

/**
 * The sweep's one line, held for the phone's Today. Where Today is open it
 * draws the line in its own list (a note above the day, with Undo); anywhere
 * else the shared pill says it, as before. `mounted` counts the Today screens
 * that draw it, so the line is said once and never twice.
 */
interface IdeaMovedState {
  notice: {
    message: string;
    runId?: string;
    undo?: () => Promise<unknown>;
  } | null;
  mounted: number;
  clear: () => void;
  /** A Today screen starts (and, on cleanup, stops) drawing the note. */
  mount: () => () => void;
}

export const useIdeaMoved = create<IdeaMovedState>((set) => ({
  notice: null,
  mounted: 0,
  clear: () => set({ notice: null }),
  mount: () => {
    set((s) => ({ mounted: s.mounted + 1 }));
    return () =>
      set((s) => ({
        mounted: Math.max(0, s.mounted - 1),
        // a note nobody was there to read stays out of the next visit
        notice: s.mounted <= 1 ? null : s.notice,
      }));
  },
}));

/** The payload of an `idea-cards` realtime event. */
export interface IdeaCardsEvent {
  message?: string;
  /** The run whose actions Undo reverses. */
  runId?: string;
}

/** The event's JSON; a malformed one reads as empty. */
export function parseIdeaCards(raw: string): IdeaCardsEvent {
  try {
    const data = JSON.parse(raw) as IdeaCardsEvent | null;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/** Why an undo did not go through, in the person's words. */
export function failureLine(error: unknown) {
  const status =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status?: unknown }).status)
      : 0;
  const message = error instanceof Error ? error.message : "";
  if (status === 409 || /conflict|409/i.test(message)) {
    return "Could not undo all of it: you changed a task since";
  }
  return "Could not undo that";
}

export interface IdeaCardsActions {
  /** Reverse the run's conversions. */
  undo: (runId: string) => Promise<unknown> | void;
}

/**
 * Show the line. Undo is offered only when the event names a run. Returns
 * whether anything was shown.
 */
export function announceIdeaCards(
  ev: IdeaCardsEvent,
  actions: IdeaCardsActions
): boolean {
  if (!ev.message) return false;
  const runId = ev.runId;
  const state = useIdeaMoved.getState();
  if (state.mounted > 0) {
    useIdeaMoved.setState({
      notice: {
        message: ev.message,
        runId,
        undo: runId ? () => Promise.resolve(actions.undo(runId)) : undefined,
      },
    });
    return true;
  }
  notify.info(ev.message, {
    dedupeKey: `idea-cards-${runId ?? ev.message}`,
    action: runId
      ? {
          label: "Undo",
          onClick: () => {
            void Promise.resolve()
              .then(() => actions.undo(runId))
              .catch((error: unknown) => {
                notify.error(failureLine(error), {
                  dedupeKey: `idea-cards-failed-${runId}`,
                });
              });
          },
        }
      : undefined,
  });
  return true;
}
