"use client";

import { useEffect, useState } from "react";

import { CATEGORY_COPY, OPTIONAL_CATEGORIES } from "@/lib/email/categories";

import { useMark } from "./SettingsContext";
import { SGroup, SRow, V3Switch } from "./kit";

type Choices = {
  tips: boolean;
  offers: boolean;
  updates: boolean;
  recap: boolean;
  fewer: boolean;
};

/**
 * Settings, Notifications, Email: which optional emails come. Mail about the
 * account and security always arrives, so it has no switch here. The same
 * choices the unsubscribe link and the preference page change.
 */
export function EmailGroup() {
  const mark = useMark();
  const [choices, setChoices] = useState<Choices | null>(null);

  useEffect(() => {
    let alive = true;
    try {
      void Promise.resolve(fetch("/api/email-preferences"))
        .then((res) => (res && res.ok ? res.json() : null))
        .then((data: Choices | null) => {
          if (alive && data) setChoices(data);
        })
        .catch(() => undefined);
    } catch {
      /* No network layer (a test, a preview): the group stays hidden. */
    }
    return () => {
      alive = false;
    };
  }, []);

  function save(patch: Partial<Choices>) {
    setChoices((current) => (current ? { ...current, ...patch } : current));
    void fetch("/api/email-preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Choices | null) => {
        if (data) {
          setChoices(data);
          mark();
        }
      })
      .catch(() => undefined);
  }

  if (!choices) return null;
  return (
    <SGroup
      title="Email"
      hint="Emails about your account and security always arrive."
    >
      {OPTIONAL_CATEGORIES.map((category) => (
        <SRow
          key={category}
          title={CATEGORY_COPY[category].label}
          desc={CATEGORY_COPY[category].description}
        >
          <V3Switch
            label={CATEGORY_COPY[category].label}
            checked={choices[category]}
            onChange={(v) => save({ [category]: v })}
          />
        </SRow>
      ))}
      <SRow
        title="Fewer emails"
        desc="At most one a week instead of one every three days."
      >
        <V3Switch
          label="Fewer emails"
          checked={choices.fewer}
          onChange={(v) => save({ fewer: v })}
        />
      </SRow>
    </SGroup>
  );
}
