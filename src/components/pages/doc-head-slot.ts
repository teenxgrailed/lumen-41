"use client";

import { useSyncExternalStore } from "react";

/**
 * Where the editor's own header controls (who is here, the save state, the
 * "Page options" menu) are drawn. The v3 document chrome puts them in the top
 * bar (prototype `DocTopRight`), so the top bar registers two empty elements
 * here and `PageWorkspace` portals the controls into them. With no slot (the
 * old shell, the phone) the editor keeps its own sticky header.
 */
export interface DocHeadSlots {
  status: HTMLElement | null;
  more: HTMLElement | null;
}

let slots: DocHeadSlots = { status: null, more: null };
const listeners = new Set<() => void>();

/** Register (or clear) one slot element. Called from a callback ref. */
export function setDocHeadSlot(
  name: keyof DocHeadSlots,
  el: HTMLElement | null
) {
  if (slots[name] === el) return;
  slots = { ...slots, [name]: el };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const EMPTY: DocHeadSlots = { status: null, more: null };

export function useDocHeadSlots(): DocHeadSlots {
  return useSyncExternalStore(
    subscribe,
    () => slots,
    () => EMPTY
  );
}
