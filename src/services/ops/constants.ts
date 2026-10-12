/**
 * Plain constants of the ops layer. Kept free of imports so the worker can
 * read them without bundling the registry and, through it, every op and
 * jsdom (the task description sanitizer), which cannot run in the worker
 * bundle.
 */

/** How long a reversible action stays undoable. */
export const UNDO_WINDOW_DAYS = 7;
