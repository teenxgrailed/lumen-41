/**
 * A tiny registry of work that is not saved yet, so the automatic reload for a
 * new version (`safe-reload.ts`) can tell it must wait. A screen with a draft
 * or an unsaved page calls `setUnsavedWork(key, true)` and clears it with
 * `false` (also on unmount). Module state only; nothing is persisted.
 */
const open = new Set<string>();

export function setUnsavedWork(key: string, unsaved: boolean) {
  if (unsaved) open.add(key);
  else open.delete(key);
}

export function hasUnsavedWork(): boolean {
  return open.size > 0;
}
