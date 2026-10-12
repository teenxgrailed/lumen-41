import { notify } from "@/lib/notifications";

import { snack as copy } from "./strings";

/**
 * PkSnack → the `notify` facade (CLAUDE.md: product code never draws its own
 * toast, and the port keeps no `PkSnack` / `ToastLayer` component).
 *
 * The mapping, one prototype call to one facade call:
 *
 *   say("Added to today")                  snack("Added to today")
 *   say("Moved to Trash", undo)            snack("Moved to Trash", undo)
 *   <PkSnack snack={{ text, undo, key }}/> nothing mounted; the stack's card
 *                                          is the toast, `key` is its id
 *   Undo button (pov-snack-undo)           the card's one action, "Undo"
 *   5 s with Undo, 2.6 s without           `duration` below, same numbers
 *
 * Every message is a "done" card: a thing finished, and the way back is the
 * card's own action. Failures are raised by the write hooks themselves.
 */
export const SNACK_UNDO_MS = 5000;
export const SNACK_PLAIN_MS = 2600;

export function snack(
  text: string,
  undo?: () => void | Promise<unknown>
): string {
  return notify.success(text, {
    duration: undo ? SNACK_UNDO_MS : SNACK_PLAIN_MS,
    ...(undo
      ? { action: { label: copy.undo, onClick: () => void undo() } }
      : {}),
  });
}
