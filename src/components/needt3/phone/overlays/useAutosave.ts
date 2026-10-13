"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A text field that saves itself: the words show at once, the write waits for
 * a pause (600 ms) so a title is one PUT, not one per key. `flush()` writes
 * what is pending (blur, closing the sheet); unmounting flushes too, so a
 * sheet swiped shut mid-word does not lose it.
 *
 * `remote` is what the server has. While nothing is pending the field follows
 * it (another device, an Undo); while a word is pending it does not, so the
 * caret is never fought.
 */
export function useAutosave(
  remote: string,
  save: (value: string) => void,
  waitMs = 600
) {
  const [value, setValue] = useState(remote);
  const latest = useRef(value);
  const pending = useRef(false);
  const timer = useRef(0);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    if (!pending.current) return;
    pending.current = false;
    saveRef.current(latest.current);
  }, []);

  const change = useCallback(
    (next: string) => {
      latest.current = next;
      pending.current = true;
      setValue(next);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, waitMs);
    },
    [flush, waitMs]
  );

  // Follow the server while nothing of ours is waiting to be saved.
  const seen = useRef(remote);
  if (remote !== seen.current) {
    seen.current = remote;
    if (!pending.current && remote !== latest.current) {
      latest.current = remote;
      setValue(remote);
    }
  }

  useEffect(() => flush, [flush]);

  return { value, change, flush };
}
