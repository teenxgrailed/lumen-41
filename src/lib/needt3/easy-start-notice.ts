/* ALWAYS EASY START, the one line. When the server simplifies a task (a first
   step on a new one, a stuck one made smaller, an overloaded day eased) the
   open app hears one `easy-start` realtime event and shows a single notice,
   "Simplified: ...", with Undo. Undo runs the action's inverse
   (`POST /api/agent/actions/:id/undo`); nothing else is drawn. */
import { notify } from "@/lib/notifications";

/** The payload of an `easy-start` realtime event. */
export interface EasyStartEvent {
  message?: string;
  /** The agent action Undo runs. */
  actionId?: string | null;
  taskId?: string;
}

/** The event's JSON; a malformed one reads as empty. */
export function parseEasyStart(raw: string): EasyStartEvent {
  try {
    const data = JSON.parse(raw) as EasyStartEvent | null;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/**
 * Show the line. `undo` runs the action's inverse; it is offered only when the
 * event names an action. Returns whether anything was shown.
 */
export function announceEasyStart(
  ev: EasyStartEvent,
  undo: (actionId: string) => Promise<unknown> | void
): boolean {
  if (!ev.message) return false;
  const actionId = ev.actionId;
  notify.info(ev.message, {
    dedupeKey: `easy-start-${actionId ?? ev.taskId ?? ev.message}`,
    action: actionId
      ? {
          label: "Undo",
          onClick: () => {
            void Promise.resolve(undo(actionId)).catch(() => undefined);
          },
        }
      : undefined,
  });
  return true;
}
