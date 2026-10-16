"use client";

import { useState } from "react";

import type { AdminFlag } from "@/services/admin/flags";

import { V3Switch } from "../needt3/settings/kit";
import { AdminNote, AdminPage, ConfirmSheet } from "./kit";
import { sendAdminJson, useAdminJson } from "./useAdminJson";

/** Flags that move money or open the product. Read as a warning under the row. */
const FLAG_WARNINGS: Record<string, string> = {
  billing_checkout: "money: turn on only after Creem approval",
  signups_open: "opens sign-up to everyone",
};

function FlagRow({
  flag,
  onChanged,
  onAskEnable,
}: {
  flag: AdminFlag;
  onChanged: () => void;
  onAskEnable: (flag: AdminFlag) => void;
}) {
  const [rollout, setRollout] = useState(String(flag.rolloutPercentage));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const warning = FLAG_WARNINGS[flag.key];
  const n = Number(rollout);
  const rolloutOk =
    rollout.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100;

  const save = async (change: {
    enabled?: boolean;
    rolloutPercentage?: number;
  }) => {
    setBusy(true);
    setError(null);
    const result = await sendAdminJson(
      `/api/admin/feature-flags/${encodeURIComponent(flag.key)}`,
      "PATCH",
      change
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChanged();
  };

  return (
    <div className="admin-row" data-admin-flag={flag.key}>
      <div className="admin-row-text">
        <span className="admin-row-title">{flag.key}</span>
        {flag.description ? (
          <span className="admin-meta">{flag.description}</span>
        ) : null}
        {!flag.exists ? (
          <span className="admin-meta">No row yet. It reads as off.</span>
        ) : null}
        {warning ? (
          <span className="admin-meta admin-warning" data-admin-warning="">
            {warning}
          </span>
        ) : null}
        {error ? <AdminNote tone="danger">{error}</AdminNote> : null}
      </div>
      <div className="admin-row-control">
        <input
          className="nt-input admin-days"
          inputMode="numeric"
          value={rollout}
          aria-label={`Rollout percent for ${flag.key}`}
          onChange={(e) => setRollout(e.target.value)}
        />
        <span className="admin-meta">%</span>
        <button
          type="button"
          className="nx-btn nx-btn-secondary"
          disabled={
            busy || !rolloutOk || Number(rollout) === flag.rolloutPercentage
          }
          data-admin-save-rollout=""
          onClick={() => save({ rolloutPercentage: n })}
        >
          Save
        </button>
        <V3Switch
          checked={flag.enabled}
          label={`${flag.key} on`}
          disabled={busy}
          onChange={(next) => {
            if (next && warning) onAskEnable(flag);
            else void save({ enabled: next });
          }}
        />
      </div>
    </div>
  );
}

/** Every feature flag with its switch and rollout percent. */
export function FlagsScreen() {
  const { data, error, loading, reload } = useAdminJson<{
    flags: AdminFlag[];
  }>("/api/admin/feature-flags");
  const [asking, setAsking] = useState<AdminFlag | null>(null);
  const [busy, setBusy] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const confirmEnable = async () => {
    if (!asking) return;
    setBusy(true);
    setAskError(null);
    const result = await sendAdminJson(
      `/api/admin/feature-flags/${encodeURIComponent(asking.key)}`,
      "PATCH",
      { enabled: true }
    );
    setBusy(false);
    if (!result.ok) {
      setAskError(result.error);
      return;
    }
    setAsking(null);
    reload();
  };

  return (
    <AdminPage
      title="Flags"
      lead="Switches and rollout percent. A change applies on the next request."
    >
      {error ? <AdminNote tone="danger">{error}</AdminNote> : null}
      {loading && !data ? <AdminNote>Loading…</AdminNote> : null}
      {data ? (
        <section className="admin-card admin-rows" data-admin-flags="">
          {data.flags.map((flag) => (
            <FlagRow
              key={`${flag.key}:${flag.enabled}:${flag.rolloutPercentage}`}
              flag={flag}
              onChanged={reload}
              onAskEnable={setAsking}
            />
          ))}
        </section>
      ) : null}
      <ConfirmSheet
        open={asking !== null}
        title={`Turn on ${asking?.key ?? ""}`}
        confirmLabel="Turn on"
        busy={busy}
        error={askError}
        onConfirm={confirmEnable}
        onClose={() => {
          if (!busy) setAsking(null);
        }}
      >
        {asking ? FLAG_WARNINGS[asking.key] : null}
      </ConfirmSheet>
    </AdminPage>
  );
}
