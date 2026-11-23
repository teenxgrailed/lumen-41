import { logger } from "@/lib/logger";

import { snack } from "./snack";

const LOG_SOURCE = "snackAfterWrite";

/**
 * Tell the person a write went through. The change is already saved, so a
 * throw while drawing the toast is logged and swallowed: it must not read as a
 * failed write (a swiped row would come back for a task that is already done).
 */
export function snackAfterWrite(
  text: string,
  undo?: () => void | Promise<unknown>
): void {
  try {
    snack(text, undo);
  } catch (error) {
    logger.error(
      "the toast after a saved write failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
  }
}
