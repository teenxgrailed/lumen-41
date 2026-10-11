"use client";

import { useRef, useState } from "react";

import { Input } from "@/components/ui/input";

import { secretToCommit } from "./secret-field";

interface SecretInputProps {
  /** What the API returned: the mask when a secret is stored, else empty. */
  stored: string;
  /**
   * Saves a typed value. Resolve to false when the save failed: the field then
   * keeps the typed value so leaving it again retries.
   */
  onCommit: (value: string) => Promise<boolean> | boolean | void;
  placeholder?: string;
  "aria-label"?: string;
}

/**
 * A password field for a stored secret. It saves once, when the person leaves
 * the field or presses Enter, never per keystroke: a per-keystroke save got
 * the mask back after the first character, and every following keystroke was
 * then dropped by the server as an edit of the mask.
 *
 * Only a field the person typed into is ever saved. `stored` can change under
 * a focused field (the settings load lands after the click), so "the draft
 * differs from stored" is not proof of an edit; an untouched field sends
 * nothing. Escape throws the edit away.
 */
export function SecretInput({
  stored,
  onCommit,
  placeholder,
  "aria-label": ariaLabel,
}: SecretInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  // Refs, not state: Escape clears these and blurs in the same handler, and
  // the blur handler must see the cleared values.
  const draftRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);

  const updateDraft = (value: string | null) => {
    draftRef.current = value;
    setDraft(value);
  };

  const commit = async () => {
    const typed = draftRef.current;
    const dirty = dirtyRef.current;
    if (!dirty || typed === null) {
      updateDraft(null);
      return;
    }
    const value = secretToCommit(stored, typed);
    dirtyRef.current = false;
    updateDraft(null);
    if (value === null) return;
    const saved = await onCommit(value);
    if (saved === false) {
      // Keep what was typed so leaving the field again retries the save.
      dirtyRef.current = true;
      updateDraft(typed);
    }
  };

  return (
    <Input
      type="password"
      // "off" is ignored for password fields; "new-password" stops Chrome
      // filling the admin's own login password into a client secret.
      autoComplete="new-password"
      aria-label={ariaLabel}
      value={draft ?? stored}
      placeholder={placeholder}
      onFocus={(event) => {
        // A failed save leaves its draft in place for the retry.
        if (draftRef.current === null) updateDraft(stored);
        // Typing replaces the mask instead of appending to it.
        event.currentTarget.select();
      }}
      onChange={(event) => {
        dirtyRef.current = true;
        updateDraft(event.target.value);
      }}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          dirtyRef.current = false;
          updateDraft(null);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
