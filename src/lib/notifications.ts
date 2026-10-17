/* WHAT THE PRODUCT SAYS, AND WHERE IT SAYS IT.
 *
 * Every surface in this product calls this facade and nothing else, which is
 * what made it possible to change where messages appear without touching any
 * of the two hundred-odd places that raise one. They go to one of two places
 * instead of to Sonner:
 *
 *   toast (default)  a compact inverted pill at the bottom centre — a thing
 *                    you did and its Undo, or a status line.
 *   island           the Ask Needt corner, bottom-right — the product speaking
 *                    on its own initiative (proactive AI nudges). Pass
 *                    `surface: "island"`.
 *
 * The five levels here are log levels; the stack's `kind` is what happened.
 * They do not line up one to one, and forcing a seventh kind into the design
 * to carry "info" would be re-deriving a decision from its result. So:
 *
 *   success          → done     a thing finished
 *   error, warning   → risk     something needs you
 *   info, loading    → agent    the product is saying something
 *
 * `loading` has no spinner, because the design has no working state: it
 * raises a sticky notice that the caller's own `dismiss(id)` later takes
 * away, which is exactly how the two callers already use it.
 */
import { dropNotice, raiseNotice } from "@/components/needt/corner/bridge";
import type {
  NoticeKind,
  NoticeSurface,
} from "@/components/needt/corner/types";

export type NotificationOptions = {
  /** The line under the title. */
  description?: string;
  /**
   * Reuses a notice so repeated status updates replace the existing one
   * instead of adding another card to the stack.
   */
  dedupeKey?: string;
  /** One button on the notice. The stack dismisses the card before running
   * it, the same as it does for its own acts. */
  action?: { label: string; onClick: () => void };
  /**
   * Where it is drawn: `toast` (default, bottom centre) for what you did and
   * its Undo; `island` for the product speaking up unprompted.
   */
  surface?: NoticeSurface;
  /** Accepted and ignored: the stack draws one card, one way. */
  id?: string | number;
  className?: string;
  closeButton?: boolean;
  duration?: number;
};

function raise(
  kind: NoticeKind,
  message: string,
  options: NotificationOptions | undefined,
  sticky?: boolean
): string {
  return raiseNotice({
    kind,
    surface: options?.surface,
    title: message,
    body: options?.description ?? "",
    key: options?.dedupeKey,
    ms: options?.duration,
    sticky,
    acts: options?.action
      ? [{ label: options.action.label, run: options.action.onClick }]
      : undefined,
  });
}

export const notify = {
  loading(message: string, options?: NotificationOptions) {
    return raise("agent", message, options, true);
  },
  success(message: string, options?: NotificationOptions) {
    return raise("done", message, options);
  },
  warning(message: string, options?: NotificationOptions) {
    return raise("risk", message, options);
  },
  error(message: string, options?: NotificationOptions) {
    return raise("risk", message, options);
  },
  info(message: string, options?: NotificationOptions) {
    return raise("agent", message, options);
  },
  dismiss(id?: string | number) {
    dropNotice(typeof id === "number" ? String(id) : id);
  },
};
