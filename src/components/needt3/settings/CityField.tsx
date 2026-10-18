"use client";

import { useEffect, useState } from "react";

/**
 * The "City" text field (Settings, General): saved on Enter or when the field
 * is left, never on every key. Empty means no weather line on Home.
 */
export function CityField({
  value,
  disabled,
  onSave,
  width = 170,
}: {
  value: string;
  disabled?: boolean;
  onSave: (city: string) => void;
  width?: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.replace(/\s+/g, " ").trim().slice(0, 80);
    setDraft(next);
    if (next !== value) onSave(next);
  };
  return (
    <input
      type="text"
      className="city-field"
      aria-label="City"
      placeholder="Not set"
      autoComplete="off"
      maxLength={80}
      style={{ width }}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
