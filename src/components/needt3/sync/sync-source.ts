import { useEffect, useSyncExternalStore } from "react";

/**
 * What the open document or board tells the one sync status in the top bar.
 * The editor registers while it is mounted; nothing registered means the
 * screen has no live source and the status shows the global state alone.
 */
export type SyncCollab = "synced" | "connecting" | "local";
export type SyncSave = "saved" | "saving" | "offline" | "failed";

export interface SyncSource {
  /** The collaboration provider: live, still connecting, or a local draft only. */
  collab?: SyncCollab;
  /** The editor's own save queue (documents only). */
  save?: SyncSave;
  /** Try again: reconnect the provider and flush the pending write. */
  retry?: () => void;
}

const sources = new Map<string, SyncSource>();
const listeners = new Set<() => void>();
let current: SyncSource | null = null;

function publish() {
  const last = Array.from(sources.values()).pop() ?? null;
  if (last === current) return;
  current = last;
  listeners.forEach((l) => l());
}

/** Register, replace (`source`) or drop (`null`) one source by key. */
export function setSyncSource(key: string, source: SyncSource | null) {
  if (source) sources.set(key, source);
  else sources.delete(key);
  publish();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useSyncSource(): SyncSource | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null
  );
}

/**
 * Mark the screen as an editing surface that has nothing of its own to report
 * (a board's grid): the save status shows, driven by the app's writes alone.
 */
export function useEditingSurface(key: string) {
  useEffect(() => {
    setSyncSource(key, {});
    return () => setSyncSource(key, null);
  }, [key]);
}
