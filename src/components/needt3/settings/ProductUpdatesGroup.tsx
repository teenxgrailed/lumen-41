"use client";

import { useEffect, useState } from "react";

import { useMark } from "./SettingsContext";
import { SGroup, SRow, V3Switch } from "./kit";

/**
 * Settings, Notifications, Product updates: the in-app popup about what is
 * new. Off hides those only. A plan limit that blocks an action, and a trial
 * about to end, still get their one popup.
 */
export function ProductUpdatesGroup() {
  const mark = useMark();
  const [on, setOn] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    try {
      void Promise.resolve(fetch("/api/popups/settings"))
        .then((res) => (res && res.ok ? res.json() : null))
        .then((data: { productUpdates: boolean } | null) => {
          if (alive && data) setOn(data.productUpdates);
        })
        .catch(() => undefined);
    } catch {
      /* No network layer (a test, a preview): the group stays hidden. */
    }
    return () => {
      alive = false;
    };
  }, []);

  function save(next: boolean) {
    setOn(next);
    void fetch("/api/popups/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productUpdates: next }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { productUpdates: boolean } | null) => {
        if (data) {
          setOn(data.productUpdates);
          mark();
        }
      })
      .catch(() => undefined);
  }

  if (on === null) return null;
  return (
    <SGroup
      title="Product updates"
      hint="Plan limits and a trial about to end still tell you."
    >
      <SRow
        title="Show what's new"
        desc="An occasional popup about new features and tips."
      >
        <V3Switch label="Show what's new" checked={on} onChange={save} />
      </SRow>
    </SGroup>
  );
}
