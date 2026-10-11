"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";

import { secretToCommit } from "./secret-field";

interface SecretInputProps {
  /** What the API returned: the mask when a secret is stored, else empty. */
  stored: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
}

/**
 * A password field for a stored secret. It saves once, when the person leaves
 * the field or presses Enter, never per keystroke: a per-keystroke save got
 * the mask back after the first character, and every following keystroke was
 * then dropped by the server as an edit of the mask. While the field has
 * focus it shows only what the person typed, whatever the store receives.
 */
export function SecretInput({
  stored,
  onCommit,
  placeholder,
  "aria-label": ariaLabel,
}: SecretInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const commit = () => {
    if (draft === null) return;
    const value = secretToCommit(stored, draft);
    setDraft(null);
    if (value !== null) onCommit(value);
  };

  return (
    <Input
      type="password"
      autoComplete="off"
      aria-label={ariaLabel}
      value={editing ? draft : stored}
      placeholder={placeholder}
      onFocus={(event) => {
        setDraft(stored);
        // Typing replaces the mask instead of appending to it.
        event.currentTarget.select();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}
