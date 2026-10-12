"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * "A full-screen layer of the app is up" (prototype `onCover(bool)`): a board
 * item, the "How to save" walkthrough. Menu A steps down to the pill and slides
 * away under the bottom edge until it is gone. A place calls
 * `usePhoneCover(open)` while its layer is up; the shell reads `useCoverActive`.
 * Several layers count: the menu returns when the last one is gone.
 */
let held = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const phoneCover = {
  /** A layer took the screen; call the result when it lets go. */
  acquire(): () => void {
    held += 1;
    emit();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      held -= 1;
      emit();
    };
  },
  active: () => held > 0,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

/** For a place: mark a full-screen layer while `active`. */
export function usePhoneCover(active: boolean) {
  useEffect(() => (active ? phoneCover.acquire() : undefined), [active]);
}

/** For the shell: is any full-screen layer up? */
export function useCoverActive() {
  return useSyncExternalStore(
    phoneCover.subscribe,
    phoneCover.active,
    () => false
  );
}
