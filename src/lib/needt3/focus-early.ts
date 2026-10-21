/* "DONE N MIN EARLY". A task ticked inside its focus ends the focus (the server
   does it, for every device and API). Each open client then hears one
   `focus-ended` event and shows two things, both decided here:

   - a toast, "Done 12 min early", the task and the minutes back in the day,
     with Undo;
   - a green slice on Home's time-left bar, right after "now", for 2.4 s: the
     returned minutes swell once, then join "free".

   What Undo restores: the task is opened again (done off, status back to
   todo; the scheduler places its block again). The focus session itself is
   NOT resumed: it is closed, its minutes stay booked to the task, and the
   person starts a new Focus if they want one. */
import { create } from "zustand";

import { notify } from "@/lib/notifications";

/** How long the green slice and its "+N min" line show. Matches the CSS. */
export const GIFT_MS = 2400;

/** The payload of a `focus-ended` realtime event. */
export interface FocusEndedEvent {
  sessionId?: string;
  /** "early" and "done": ended by its task being ticked; "notify": clock ran out. */
  status?: string;
  message?: string;
  /** Minutes given back to the day (status "early"). */
  minutes?: number;
  taskId?: string;
  taskTitle?: string;
}

/** The event's JSON; a malformed one reads as empty (the caller still refreshes). */
export function parseFocusEnded(raw: string): FocusEndedEvent {
  try {
    const data = JSON.parse(raw) as FocusEndedEvent | null;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/** The toast for an early finish, or null when nothing was given back. */
export function earlyNotice(ev: FocusEndedEvent): {
  title: string;
  description?: string;
  taskId?: string;
  minutes: number;
} | null {
  if (ev.status !== "early" || !ev.message) return null;
  const minutes =
    typeof ev.minutes === "number" && ev.minutes > 0 ? ev.minutes : 0;
  return {
    title: ev.message,
    description: minutes
      ? `${ev.taskTitle ? `${ev.taskTitle} · ` : ""}focus ended, ${minutes} min back in your day`
      : undefined,
    taskId: ev.taskId,
    minutes,
  };
}

export interface FocusGift {
  /** Minutes given back. */
  minutes: number;
  /** Changes on every show, so the animation replays. */
  key: number;
}

interface GiftStore {
  gift: FocusGift | null;
}

export const useFocusGift = create<GiftStore>(() => ({ gift: null }));

let giftTimer: ReturnType<typeof setTimeout> | null = null;
let giftKey = 0;

/** Show the green slice for GIFT_MS, then take it away. A newer one replaces it. */
export function showFocusGift(minutes: number): void {
  if (!(minutes > 0)) return;
  if (giftTimer) clearTimeout(giftTimer);
  giftKey += 1;
  useFocusGift.setState({ gift: { minutes, key: giftKey } });
  giftTimer = setTimeout(() => {
    giftTimer = null;
    useFocusGift.setState({ gift: null });
  }, GIFT_MS);
}

/** Take the slice away at once (an undone finish gives nothing back). */
export function clearFocusGift(): void {
  if (giftTimer) clearTimeout(giftTimer);
  giftTimer = null;
  useFocusGift.setState({ gift: null });
}

/**
 * The two things an early finish shows: the toast with Undo, and the slice.
 * `reopen` opens the task again (Undo); the slice goes with it, because an
 * undone finish gave nothing back. Returns whether anything was shown.
 */
export function announceEarlyFinish(
  ev: FocusEndedEvent,
  reopen: (taskId: string) => Promise<unknown> | void
): boolean {
  const notice = earlyNotice(ev);
  if (!notice) return false;
  const taskId = notice.taskId;
  notify.success(notice.title, {
    description: notice.description,
    dedupeKey: `focus-early-${ev.sessionId ?? "session"}`,
    action: taskId
      ? {
          label: "Undo",
          onClick: () => {
            clearFocusGift();
            void Promise.resolve(reopen(taskId)).catch(() => undefined);
          },
        }
      : undefined,
  });
  showFocusGift(notice.minutes);
  return true;
}
