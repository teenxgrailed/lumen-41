"use client";

import { useState } from "react";

import type {
  AdminPromoCode,
  AdminPromoRedemption,
} from "@/services/promo/codes";

import { newDate } from "@/lib/date-utils";

import { SSelect } from "../needt3/settings/kit";
import { dayOf, minuteOf } from "./format";
import { AdminNote, AdminPage, ConfirmSheet } from "./kit";
import { sendAdminJson, useAdminJson } from "./useAdminJson";

type Kind = "trial_days" | "pro_days" | "lifetime";

const KIND_LABEL: Record<string, string> = {
  trial_days: "Trial days",
  pro_days: "Pro days",
  lifetime: "Lifetime",
};

function worth(code: AdminPromoCode): string {
  return code.kind === "lifetime"
    ? "Lifetime"
    : `${code.value ?? 0} days of ${code.kind === "trial_days" ? "trial" : "Pro"}`;
}

function status(code: AdminPromoCode, nowIso: string): string {
  if (!code.active) return "Off";
  if (code.expiresAt && code.expiresAt <= nowIso) return "Expired";
  if (
    code.maxRedemptions !== null &&
    code.redeemedCount >= code.maxRedemptions
  ) {
    return "Used up";
  }
  return "Active";
}

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<Kind>("trial_days");
  const [days, setDays] = useState("14");
  const [max, setMax] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCode = async () => {
    setError(null);
    try {
      const response = await fetch("/api/admin/promo-codes/generate", {
        cache: "no-store",
      });
      const body = (await response.json()) as { code?: string };
      if (!response.ok || !body.code) throw new Error("failed");
      setCode(body.code);
    } catch {
      setError("Could not generate a code.");
    }
  };

  const daysN = Number(days);
  const maxN = Number(max);
  const valid =
    code.trim().length >= 3 &&
    (kind === "lifetime" ||
      (Number.isInteger(daysN) && daysN >= 1 && daysN <= 3650)) &&
    (max.trim() === "" || (Number.isInteger(maxN) && maxN >= 1));

  const create = async () => {
    setBusy(true);
    setError(null);
    const result = await sendAdminJson("/api/admin/promo-codes", "POST", {
      code,
      kind,
      value: kind === "lifetime" ? null : daysN,
      maxRedemptions: max.trim() === "" ? null : maxN,
      expiresAt: expires ? `${expires}T23:59:59.000Z` : null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCode("");
    setMax("");
    setExpires("");
    onCreated();
  };

  return (
    <section className="admin-card admin-rows" data-admin-promo-form="">
      <div className="admin-row">
        <div className="admin-row-text">
          <span className="admin-row-title">Code</span>
          <span className="admin-meta">
            Letters, digits and dashes. Stored upper-case.
          </span>
        </div>
        <div className="admin-row-control">
          <input
            className="nt-input admin-code"
            value={code}
            aria-label="Code"
            autoComplete="off"
            spellCheck={false}
            maxLength={40}
            onChange={(e) => setCode(e.target.value)}
          />
          <button
            type="button"
            className="nx-btn nx-btn-secondary"
            data-admin-generate=""
            onClick={() => void fetchCode()}
          >
            Generate
          </button>
        </div>
      </div>
      <div className="admin-row">
        <div className="admin-row-text">
          <span className="admin-row-title">Gives</span>
          <span className="admin-meta">
            Lifetime takes one of the 300 seats.
          </span>
        </div>
        <div className="admin-row-control">
          <SSelect
            value={kind}
            label="What the code gives"
            width={150}
            options={[
              ["trial_days", "Trial days"],
              ["pro_days", "Pro days"],
              ["lifetime", "Lifetime"],
            ]}
            onChange={(v) => setKind(v as Kind)}
          />
          {kind !== "lifetime" ? (
            <input
              className="nt-input admin-days"
              inputMode="numeric"
              value={days}
              aria-label="Days"
              onChange={(e) => setDays(e.target.value)}
            />
          ) : null}
        </div>
      </div>
      <div className="admin-row">
        <div className="admin-row-text">
          <span className="admin-row-title">Limit</span>
          <span className="admin-meta">
            Empty means no limit on uses or on date.
          </span>
        </div>
        <div className="admin-row-control">
          <input
            className="nt-input admin-days"
            inputMode="numeric"
            value={max}
            placeholder="Uses"
            aria-label="Maximum uses"
            onChange={(e) => setMax(e.target.value)}
          />
          <input
            className="nt-input admin-date"
            type="date"
            value={expires}
            aria-label="Expires on"
            onChange={(e) => setExpires(e.target.value)}
          />
        </div>
      </div>
      <div className="admin-row">
        <div className="admin-row-text">
          {error ? <AdminNote tone="danger">{error}</AdminNote> : null}
        </div>
        <div className="admin-row-control">
          <button
            type="button"
            className="nx-btn nx-btn-secondary"
            disabled={busy || !valid}
            data-admin-create=""
            onClick={() => void create()}
          >
            Create code
          </button>
        </div>
      </div>
    </section>
  );
}

function Redemptions({ codeId }: { codeId: string }) {
  const { data, error, loading } = useAdminJson<{
    redemptions: AdminPromoRedemption[];
  }>(`/api/admin/promo-codes/${encodeURIComponent(codeId)}/redemptions`);
  if (error) return <AdminNote tone="danger">{error}</AdminNote>;
  if (loading && !data) return <AdminNote>Loading…</AdminNote>;
  if (!data || data.redemptions.length === 0) {
    return <AdminNote>Nobody has used this code.</AdminNote>;
  }
  return (
    <ul className="admin-history" data-admin-redemptions="">
      {data.redemptions.map((r) => (
        <li key={r.id}>
          <span>{r.email ?? r.userId}</span>
          <span className="admin-meta">{minuteOf(r.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Create codes, see what each has given out, switch one off. */
export function PromoScreen() {
  const { data, error, loading, reload } = useAdminJson<{
    codes: AdminPromoCode[];
  }>("/api/admin/promo-codes");
  const [open, setOpen] = useState<string | null>(null);
  const [off, setOff] = useState<AdminPromoCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [offError, setOffError] = useState<string | null>(null);
  const nowIso = newDate().toISOString();

  const deactivate = async () => {
    if (!off) return;
    setBusy(true);
    setOffError(null);
    const result = await sendAdminJson(
      `/api/admin/promo-codes/${encodeURIComponent(off.id)}`,
      "PATCH",
      { active: false }
    );
    setBusy(false);
    if (!result.ok) {
      setOffError(result.error);
      return;
    }
    setOff(null);
    reload();
  };

  return (
    <AdminPage
      title="Promo codes"
      lead="A code adds trial days, Pro days or Lifetime. One use per person."
    >
      <CreateForm onCreated={reload} />
      {error ? <AdminNote tone="danger">{error}</AdminNote> : null}
      {loading && !data ? <AdminNote>Loading…</AdminNote> : null}
      {data && data.codes.length === 0 ? (
        <AdminNote>No codes yet.</AdminNote>
      ) : null}
      {data && data.codes.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table" data-admin-codes="">
            <thead>
              <tr>
                <th>Code</th>
                <th>Gives</th>
                <th>Used</th>
                <th>Expires</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.codes.map((c) => (
                <tr key={c.id} data-admin-code={c.code}>
                  <td>
                    <code>{c.code}</code>
                  </td>
                  <td>
                    {KIND_LABEL[c.kind] ?? c.kind}: {worth(c)}
                  </td>
                  <td>
                    {c.redeemedCount}
                    {c.maxRedemptions !== null ? ` / ${c.maxRedemptions}` : ""}
                  </td>
                  <td>{dayOf(c.expiresAt)}</td>
                  <td>
                    <span className="admin-badge">{status(c, nowIso)}</span>
                  </td>
                  <td className="admin-table-actions">
                    <button
                      type="button"
                      className="nx-btn nx-btn-secondary"
                      data-admin-redemptions-toggle=""
                      aria-expanded={open === c.id}
                      onClick={() => setOpen(open === c.id ? null : c.id)}
                    >
                      Uses
                    </button>
                    {c.active ? (
                      <button
                        type="button"
                        className="nx-btn nx-btn-danger"
                        data-admin-deactivate=""
                        onClick={() => {
                          setOffError(null);
                          setOff(c);
                        }}
                      >
                        Deactivate
                      </button>
                    ) : null}
                    {open === c.id ? <Redemptions codeId={c.id} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <ConfirmSheet
        open={off !== null}
        title="Deactivate the code"
        confirmLabel="Deactivate"
        danger
        busy={busy}
        error={offError}
        onConfirm={deactivate}
        onClose={() => {
          if (!busy) setOff(null);
        }}
      >
        {off
          ? `${off.code} stops working. People who already used it keep what it gave.`
          : null}
      </ConfirmSheet>
    </AdminPage>
  );
}
