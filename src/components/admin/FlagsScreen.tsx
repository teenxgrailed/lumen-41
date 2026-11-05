"use client";

import { type FormEvent, useState } from "react";

import type { AdminFeatureFlagRow } from "@/services/admin/feature-flags";

import { notify } from "@/lib/notifications";

import { minuteOf } from "./format";
import { AdminNote, AdminPage, ConfirmSheet } from "./kit";
import { sendAdminJson, useAdminJson } from "./useAdminJson";

interface OverrideRow {
  userId: string;
  email: string | null;
  enabled: boolean;
}

interface ChangeRow {
  id: string;
  actorEmail: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

interface FlagDetail {
  flag: { overrides?: OverrideRow[] };
  history: ChangeRow[];
}

/** One request to the PATCH route plus the words the confirm dialog shows. */
interface Pending {
  key: string;
  body: Record<string, unknown>;
  title: string;
  text: string;
  confirmLabel: string;
  /** False applies at once: only 100% and switching off ask first. */
  confirm: boolean;
}

/** A change snapshot in one short line: "on · 25%" or "override a@b.c on". */
export function describeSnapshot(value: unknown): string {
  if (!value || typeof value !== "object") return "none";
  const v = value as {
    enabled?: unknown;
    rolloutPercentage?: unknown;
    override?: { email?: string | null; enabled?: boolean } | null;
    email?: string | null;
  };
  if ("override" in v) {
    if (!v.override)
      return v.email ? `no override for ${v.email}` : "no override";
    return `override ${v.override.email ?? "?"} ${v.override.enabled ? "on" : "off"}`;
  }
  return `${v.enabled ? "on" : "off"} · ${v.rolloutPercentage ?? 0}%`;
}

function FlagDetailPanel({
  flagKey,
  onChanged,
  ask,
}: {
  flagKey: string;
  onChanged: () => void;
  ask: (pending: Pending) => void;
}) {
  const { data, error, loading, reload } = useAdminJson<FlagDetail>(
    `/api/admin/feature-flags/${encodeURIComponent(flagKey)}`
  );
  const [email, setEmail] = useState("");
  const [userEnabled, setUserEnabled] = useState(true);
  const [busy, setBusy] = useState(false);

  const send = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    const result = await sendAdminJson(
      `/api/admin/feature-flags/${encodeURIComponent(flagKey)}`,
      "PATCH",
      body
    );
    setBusy(false);
    if (!result.ok) {
      notify.error(result.error);
      return false;
    }
    notify.success(done);
    reload();
    onChanged();
    return true;
  };

  const addByEmail = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    if (
      await send(
        { email: trimmed, userEnabled },
        `Override set for ${trimmed}.`
      )
    ) {
      setEmail("");
    }
  };

  const overrides = data?.flag.overrides ?? [];
  return (
    <div className="admin-flag-detail" data-admin-flag-detail={flagKey}>
      {error ? <AdminNote tone="danger">{error}</AdminNote> : null}
      {loading && !data ? <AdminNote>Loading…</AdminNote> : null}
      <h3 className="admin-section-title">Per-person overrides</h3>
      <form className="admin-flag-form" onSubmit={addByEmail}>
        <input
          className="nt-input"
          type="email"
          value={email}
          placeholder="Account email"
          aria-label="Override email"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select
          className="nt-input"
          aria-label="Override state"
          value={userEnabled ? "on" : "off"}
          onChange={(e) => setUserEnabled(e.target.value === "on")}
        >
          <option value="on">On</option>
          <option value="off">Off</option>
        </select>
        <button
          type="submit"
          className="nx-btn nx-btn-secondary"
          disabled={busy || !email.trim()}
          data-admin-override-add=""
        >
          Add
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-secondary"
          disabled={busy}
          data-admin-override-self=""
          onClick={() =>
            void send({ self: true, userEnabled }, "Override set for you.")
          }
        >
          {userEnabled ? "On for me" : "Off for me"}
        </button>
      </form>
      {overrides.length === 0 && data ? (
        <AdminNote>No overrides.</AdminNote>
      ) : null}
      {overrides.length > 0 ? (
        <ul className="admin-history" data-admin-overrides="">
          {overrides.map((o) => (
            <li key={o.userId}>
              <span>
                {o.email ?? o.userId}{" "}
                <span className="admin-badge">{o.enabled ? "On" : "Off"}</span>
              </span>
              <span className="admin-flag-actions">
                <button
                  type="button"
                  className="nx-btn nx-btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    void send(
                      { userId: o.userId, userEnabled: !o.enabled },
                      "Override changed."
                    )
                  }
                >
                  Turn {o.enabled ? "off" : "on"}
                </button>
                <button
                  type="button"
                  className="nx-btn nx-btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    ask({
                      key: flagKey,
                      body: { userId: o.userId, remove: true },
                      title: "Remove override?",
                      text: `${o.email ?? o.userId} goes back to the flag's own state.`,
                      confirmLabel: "Remove",
                      confirm: true,
                    })
                  }
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <h3 className="admin-section-title">Last 20 changes</h3>
      {data && data.history.length === 0 ? (
        <AdminNote>No changes recorded yet.</AdminNote>
      ) : null}
      {data && data.history.length > 0 ? (
        <ul className="admin-history" data-admin-flag-history="">
          {data.history.map((change) => (
            <li key={change.id}>
              <span>
                {describeSnapshot(change.before)} →{" "}
                {describeSnapshot(change.after)}
              </span>
              <span className="admin-meta">
                {change.actorEmail ?? "unknown"} · {minuteOf(change.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FlagRow({
  flag,
  open,
  onToggleOpen,
  ask,
  onChanged,
}: {
  flag: AdminFeatureFlagRow;
  open: boolean;
  onToggleOpen: () => void;
  ask: (pending: Pending) => void;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState(String(flag.rolloutPercentage));
  const parsed = Number(draft);
  const valid =
    draft.trim() !== "" &&
    Number.isInteger(parsed) &&
    parsed >= 0 &&
    parsed <= 100;
  const changed = valid && parsed !== flag.rolloutPercentage;

  const toggle = () => {
    const turningOn = !flag.enabled;
    const everyone = turningOn && flag.rolloutPercentage === 100;
    ask({
      key: flag.key,
      body: { enabled: turningOn },
      title: turningOn ? `Turn on ${flag.key}?` : `Turn off ${flag.key}?`,
      text: turningOn
        ? everyone
          ? "Rollout is 100%, so everyone gets it."
          : `It is on for ${flag.rolloutPercentage}% of people.`
        : "Everyone loses it, except people with an override set to on.",
      confirmLabel: turningOn ? "Turn on" : "Turn off",
      confirm: !turningOn || everyone,
    });
  };
  const saveRollout = () => {
    /* Lowering a live rollout takes the flag away from people who have it. */
    const lowersLive = flag.enabled && parsed < flag.rolloutPercentage;
    ask({
      key: flag.key,
      body: { rolloutPercentage: parsed },
      title: `Set ${flag.key} to ${parsed}%?`,
      text:
        parsed === 100
          ? flag.enabled
            ? "Everyone gets it."
            : "Everyone will get it as soon as the flag is on."
          : lowersLive
            ? parsed === 0
              ? "The flag is on, so everyone loses it, except people with an override set to on."
              : `The flag is on, so rollout drops from ${flag.rolloutPercentage}% to ${parsed}% and some people lose it.`
            : `Rollout goes from ${flag.rolloutPercentage}% to ${parsed}%.`,
      confirmLabel: "Set rollout",
      confirm: parsed === 100 || lowersLive,
    });
  };

  return (
    <>
      <tr data-admin-flag={flag.key}>
        <td>
          <div className="admin-flag-key">{flag.key}</div>
          {flag.description ? (
            <div className="admin-meta">{flag.description}</div>
          ) : null}
        </td>
        <td>
          <button
            type="button"
            role="switch"
            aria-checked={flag.enabled}
            aria-label={`${flag.key} enabled`}
            className="nx-btn nx-btn-secondary"
            data-admin-flag-toggle=""
            onClick={toggle}
          >
            {flag.enabled ? "On" : "Off"}
          </button>
        </td>
        <td>
          <span className="admin-flag-rollout">
            <input
              className="nt-input"
              type="number"
              min={0}
              max={100}
              step={1}
              value={draft}
              aria-label={`${flag.key} rollout percent`}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              type="button"
              className="nx-btn nx-btn-secondary"
              disabled={!changed}
              data-admin-flag-rollout-save=""
              onClick={saveRollout}
            >
              Save
            </button>
          </span>
        </td>
        <td>{flag.overrides}</td>
        <td>
          <span className="admin-badge">
            {flag.persisted ? "Has row" : "No row yet"}
          </span>
        </td>
        <td>
          <button
            type="button"
            className="nx-btn nx-btn-secondary"
            aria-expanded={open}
            data-admin-flag-open=""
            onClick={onToggleOpen}
          >
            {open ? "Close" : "Overrides and history"}
          </button>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={6}>
            <FlagDetailPanel
              flagKey={flag.key}
              onChanged={onChanged}
              ask={ask}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * Every feature flag the code reads plus any stored row: switch, rollout
 * percent, per-person overrides by email, and the last changes. Turning a flag
 * off or rolling it to everyone asks first. The admin check is the layout's;
 * the routes check again.
 */
export function FlagsScreen() {
  const { data, error, loading, reload } = useAdminJson<{
    flags: AdminFeatureFlagRow[];
  }>("/api/admin/feature-flags");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  /* Per flag: bumps its open detail panel after a change made from the list,
     so the other rows keep what is typed in them. */
  const [detailTicks, setDetailTicks] = useState<Record<string, number>>({});

  const apply = async (change: Pending, inDialog: boolean) => {
    setBusy(true);
    setConfirmError(null);
    const result = await sendAdminJson(
      `/api/admin/feature-flags/${encodeURIComponent(change.key)}`,
      "PATCH",
      change.body
    );
    setBusy(false);
    if (!result.ok) {
      if (inDialog) setConfirmError(result.error);
      else notify.error(result.error);
      return;
    }
    notify.success(`${change.key} updated.`);
    setPending(null);
    setDetailTicks((t) => ({ ...t, [change.key]: (t[change.key] ?? 0) + 1 }));
    reload();
  };
  const confirm = () => {
    if (pending) void apply(pending, true);
  };
  const ask = (next: Pending) => {
    setConfirmError(null);
    if (next.confirm) setPending(next);
    else void apply(next, false);
  };

  return (
    <AdminPage
      title="Feature flags"
      lead="Switch a flag, set its rollout, or force it on or off for one person."
    >
      {error ? <AdminNote tone="danger">{error}</AdminNote> : null}
      {loading && !data ? <AdminNote>Loading…</AdminNote> : null}
      {data && data.flags.length === 0 ? (
        <AdminNote>No flags.</AdminNote>
      ) : null}
      {data && data.flags.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table" data-admin-flags="">
            <thead>
              <tr>
                <th>Flag</th>
                <th>Enabled</th>
                <th>Rollout %</th>
                <th>Overrides</th>
                <th>Row</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.flags.map((flag) => (
                <FlagRow
                  /* A changed server value resets the draft input. */
                  key={`${flag.key}:${flag.rolloutPercentage}:${detailTicks[flag.key] ?? 0}`}
                  flag={flag}
                  open={openKey === flag.key}
                  onToggleOpen={() =>
                    setOpenKey(openKey === flag.key ? null : flag.key)
                  }
                  ask={ask}
                  onChanged={reload}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <ConfirmSheet
        open={pending !== null}
        title={pending?.title ?? ""}
        confirmLabel={pending?.confirmLabel ?? "Confirm"}
        danger
        busy={busy}
        error={confirmError}
        onConfirm={confirm}
        onClose={() => {
          if (!busy) setPending(null);
        }}
      >
        {pending?.text}
      </ConfirmSheet>
    </AdminPage>
  );
}
