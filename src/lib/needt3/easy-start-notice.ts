/* ALWAYS EASY START, the one line. When the server simplifies a task (a first
   step on a new one, a stuck one made smaller, an overloaded day eased) the
   open app hears one `easy-start` realtime event and shows a single notice,
   "Simplified: ...", with Undo. Undo runs the action's inverse
   (`POST /api/agent/actions/:id/undo`). In "suggest" mode nothing has changed
   yet: the line reads "Simplify? ..." and its button is Apply, which runs the
   same `task.simplify` (so it can be undone too). Nothing else is drawn. */
import { notify } from "@/lib/notifications";

/** The payload of an `easy-start` realtime event. */
export interface EasyStartEvent {
  message?: string;
  /** The agent action Undo runs. */
  actionId?: string | null;
  /** "Suggest" mode: the proposal Apply runs. */
  proposalId?: string | null;
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

/** Why an undo or an apply did not go through, in the person's words. */
function failureLine(error: unknown, verb: "Undo" | "Apply") {
  const status =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status?: unknown }).status)
      : 0;
  const message = error instanceof Error ? error.message : "";
  if (status === 409 || /conflict|409/i.test(message)) {
    return verb === "Undo"
      ? "Could not undo: you changed it since"
      : "Could not apply: you changed the task since";
  }
  return verb === "Undo" ? "Could not undo that" : "Could not apply that";
}

export interface EasyStartActions {
  /** Run the logged action's inverse. */
  undo: (actionId: string) => Promise<unknown> | void;
  /** Apply a proposal (suggest mode). */
  apply?: (proposalId: string) => Promise<unknown> | void;
}

/**
 * Show the line. Undo is offered only when the event names an action, Apply
 * only when it names a proposal. A failed Undo or Apply (a 409 included, when
 * the person changed the task since) says so instead of failing silently.
 * Returns whether anything was shown.
 */
export function announceEasyStart(
  ev: EasyStartEvent,
  actions: EasyStartActions
): boolean {
  if (!ev.message) return false;
  const run = (verb: "Undo" | "Apply", job: () => Promise<unknown> | void) => {
    void Promise.resolve()
      .then(job)
      .catch((error: unknown) => {
        notify.error(failureLine(error, verb), {
          dedupeKey: `easy-start-failed-${ev.actionId ?? ev.proposalId ?? ev.taskId ?? ""}`,
        });
      });
  };
  const actionId = ev.actionId;
  const proposalId = ev.proposalId;
  notify.info(ev.message, {
    dedupeKey: `easy-start-${proposalId ?? actionId ?? ev.taskId ?? ev.message}`,
    action:
      proposalId && actions.apply
        ? {
            label: "Apply",
            onClick: () => run("Apply", () => actions.apply?.(proposalId)),
          }
        : actionId
          ? {
              label: "Undo",
              onClick: () => run("Undo", () => actions.undo(actionId)),
            }
          : undefined,
  });
  return true;
}
