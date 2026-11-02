"use client";

import { useMemo, useState } from "react";

import { newDate } from "@/lib/date-utils";

import { AdminNote, AdminPage } from "./kit";
import { sendAdminJson, useAdminJson } from "./useAdminJson";

type Template = {
  key: string;
  label: string;
  kind: "optional" | "transactional";
  subject: string;
  html: string;
  text: string;
  words: number;
  headers: Record<string, string>;
};

type Overview = {
  settings: {
    footerSet: boolean;
    footerMissing: string[];
    promoCodeSet: boolean;
    trackingEndsAt: string | null;
    trackingActive: boolean;
  };
  flag: { enabled: boolean; rolloutPercentage: number };
  dryRun: boolean;
  rules: Array<{ key: string; category: string; priority: number }>;
  counts: Array<{
    ruleKey: string;
    status: string;
    reason: string | null;
    count: number;
  }>;
  recent: Array<{
    id: string;
    ruleKey: string;
    status: string;
    reason: string | null;
    attempts: number;
    sentAt: string | null;
    opens: number;
    clicks: number;
    updatedAt: string;
  }>;
};

type Broadcast = {
  id: string;
  subject: string;
  segment: string;
  category: string;
  status: string;
  scheduledAt: string | null;
  recipientCount: number | null;
  sentCount: number;
  skippedCount: number;
  testedAt: string | null;
  contentUpdatedAt: string;
  createdByKind: string;
};

/** Forces the dark rules of an email on, so the dark look can be checked. */
const forceDark = (html: string) =>
  html.replace("@media (prefers-color-scheme:dark){", "@media all{");

function Banners({ overview }: { overview: Overview }) {
  const s = overview.settings;
  return (
    <>
      {!s.footerSet ? (
        <AdminNote tone="danger">
          Optional email is paused: set the footer{" "}
          {s.footerMissing.join(" and ")} in System Settings. Account email is
          unaffected.
        </AdminNote>
      ) : null}
      {overview.dryRun ? (
        <AdminNote>
          Dry run: the engine records what it would send and sends nothing.
        </AdminNote>
      ) : null}
      {!overview.flag.enabled ? (
        <AdminNote>
          The flag email_program is off, so no optional email is sent yet.
        </AdminNote>
      ) : (
        <AdminNote>
          The flag email_program is on for {overview.flag.rolloutPercentage}% of
          accounts.
        </AdminNote>
      )}
      <AdminNote>
        Open and click tracking is{" "}
        {s.trackingActive
          ? `on until ${s.trackingEndsAt?.slice(0, 10)}`
          : "off"}
        .
      </AdminNote>
    </>
  );
}

function Templates() {
  const { data, error, loading } = useAdminJson<{
    templates: Template[];
    realFooter: boolean;
  }>("/api/admin/email/templates");
  const [key, setKey] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const [plain, setPlain] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const current = useMemo(
    () =>
      data?.templates.find((t) => t.key === (key ?? data.templates[0]?.key)),
    [data, key]
  );
  if (loading) return <AdminNote>Loading the templates.</AdminNote>;
  if (error) return <AdminNote tone="danger">{error}</AdminNote>;
  if (!data || !current) return null;
  const sendMe = async () => {
    setNote(null);
    const result = await sendAdminJson<{ sentTo: string }>(
      "/api/admin/email/templates",
      "POST",
      { key: current.key }
    );
    setNote(result.ok ? `Sent to ${result.data.sentTo}.` : result.error);
  };
  return (
    <section className="admin-card p-4" aria-label="Template preview">
      <div className="admin-toolbar">
        <select
          className="nt-input"
          aria-label="Template"
          value={current.key}
          onChange={(e) => setKey(e.target.value)}
        >
          {data.templates.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="nx-btn nx-btn-secondary"
          onClick={() => setDark((v) => !v)}
        >
          {dark ? "Light" : "Dark"}
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-secondary"
          onClick={() => setPlain((v) => !v)}
        >
          {plain ? "HTML" : "Plain text"}
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-secondary"
          onClick={sendMe}
        >
          Send me this
        </button>
      </div>
      {note ? <AdminNote>{note}</AdminNote> : null}
      <p className="admin-lead">
        Subject: {current.subject} ({current.words} words,{" "}
        {current.kind === "optional" ? "optional" : "account"} email)
      </p>
      <p className="admin-lead">
        Headers:{" "}
        {Object.entries(current.headers)
          .map(([name, value]) => `${name}: ${value}`)
          .join(" · ")}
      </p>
      {!data.realFooter ? (
        <AdminNote>
          The footer shows example text because the real one is not set yet.
        </AdminNote>
      ) : null}
      {plain ? (
        <pre className="admin-note" style={{ whiteSpace: "pre-wrap" }}>
          {current.text}
        </pre>
      ) : (
        <iframe
          title={`Preview of ${current.label}`}
          sandbox=""
          srcDoc={dark ? forceDark(current.html) : current.html}
          style={{ width: "100%", height: 560, border: 0, borderRadius: 8 }}
        />
      )}
    </section>
  );
}

const SEGMENTS = ["free", "pro", "trial", "students", "all"] as const;

function Broadcasts() {
  const { data, error, loading, reload } = useAdminJson<{
    broadcasts: Broadcast[];
  }>("/api/admin/email/broadcasts");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [body, setBody] = useState("");
  const [buttonLabel, setButtonLabel] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [segment, setSegment] = useState<(typeof SEGMENTS)[number]>("free");
  const [category, setCategory] = useState<"updates" | "offers">("updates");
  const [count, setCount] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [when, setWhen] = useState("");
  const [confirm, setConfirm] = useState("");

  const run = async (id: string, action: "test" | "schedule" | "cancel") => {
    setMessage(null);
    if (action === "schedule" && Number.isNaN(newDate(when).getTime())) {
      setMessage("Pick a date and time.");
      return;
    }
    const result = await sendAdminJson<unknown>(
      `/api/admin/email/broadcasts/${id}/actions`,
      "POST",
      action === "schedule"
        ? {
            action,
            at: newDate(when).toISOString(),
            ...(confirm ? { confirmCount: Number(confirm) } : {}),
          }
        : { action }
    );
    setMessage(result.ok ? "Done." : result.error);
    reload();
  };

  const countNow = async () => {
    const response = await fetch(
      `/api/admin/email/count?segment=${segment}&category=${category}`,
      { cache: "no-store" }
    );
    const json = (await response.json().catch(() => null)) as {
      count?: number;
    } | null;
    setCount(typeof json?.count === "number" ? json.count : null);
  };

  const save = async () => {
    setMessage(null);
    const result = await sendAdminJson<unknown>(
      "/api/admin/email/broadcasts",
      "POST",
      {
        subject,
        preheader,
        paragraphs: body
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean),
        buttonLabel: buttonLabel || null,
        buttonUrl: buttonUrl || null,
        category,
        segment,
      }
    );
    setMessage(result.ok ? "Draft saved." : result.error);
    if (result.ok) {
      setSubject("");
      setBody("");
      reload();
    }
  };

  return (
    <section className="admin-card p-4" aria-label="Broadcasts">
      <h2 className="admin-title">Broadcasts</h2>
      <div className="admin-stack">
        <input
          className="nt-input"
          placeholder="Subject (100 characters at most)"
          value={subject}
          maxLength={100}
          onChange={(e) => setSubject(e.target.value)}
        />
        <input
          className="nt-input"
          placeholder="Preheader"
          value={preheader}
          maxLength={150}
          onChange={(e) => setPreheader(e.target.value)}
        />
        <textarea
          className="nt-input"
          rows={6}
          placeholder="Paragraphs, separated by a blank line"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="admin-toolbar">
          <input
            className="nt-input"
            placeholder="Button label (optional)"
            value={buttonLabel}
            onChange={(e) => setButtonLabel(e.target.value)}
          />
          <input
            className="nt-input"
            placeholder="https:// link"
            value={buttonUrl}
            onChange={(e) => setButtonUrl(e.target.value)}
          />
        </div>
        <div className="admin-toolbar">
          <select
            className="nt-input"
            aria-label="Segment"
            value={segment}
            onChange={(e) => {
              setSegment(e.target.value as (typeof SEGMENTS)[number]);
              setCount(null);
            }}
          >
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="nt-input"
            aria-label="Category"
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as "updates" | "offers")
            }
          >
            <option value="updates">updates</option>
            <option value="offers">offers</option>
          </select>
          <button
            type="button"
            className="nx-btn nx-btn-secondary"
            onClick={countNow}
          >
            Count recipients
          </button>
          {count !== null ? <span>{count} would receive it now</span> : null}
          <button
            type="button"
            className="nx-btn nx-btn-secondary"
            onClick={save}
          >
            Save draft
          </button>
        </div>
      </div>
      {message ? <AdminNote>{message}</AdminNote> : null}
      {loading ? <AdminNote>Loading.</AdminNote> : null}
      {error ? <AdminNote tone="danger">{error}</AdminNote> : null}
      <div className="admin-toolbar">
        <input
          className="nt-input"
          type="datetime-local"
          aria-label="Send at"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
        <input
          className="nt-input"
          inputMode="numeric"
          placeholder="Type the count to send to all"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <ul className="admin-stack">
        {(data?.broadcasts ?? []).map((b) => (
          <li key={b.id} className="admin-card p-3">
            <p>
              {b.subject} · {b.segment} · {b.status}
              {b.createdByKind === "claude" ? " · written by Claude" : ""}
            </p>
            <p className="admin-lead">
              {b.recipientCount ?? "?"} recipients · sent {b.sentCount} ·
              skipped {b.skippedCount}
              {b.scheduledAt ? ` · at ${b.scheduledAt.slice(0, 16)}` : ""}
            </p>
            <div className="admin-toolbar">
              <button
                type="button"
                className="nx-btn nx-btn-secondary"
                onClick={() => run(b.id, "test")}
              >
                Send test to me
              </button>
              <button
                type="button"
                className="nx-btn nx-btn-secondary"
                disabled={!when}
                onClick={() => run(b.id, "schedule")}
              >
                Schedule
              </button>
              <button
                type="button"
                className="nx-btn nx-btn-secondary"
                onClick={() => run(b.id, "cancel")}
              >
                Cancel
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Ledger({ overview }: { overview: Overview }) {
  const byRule = new Map<string, Record<string, number>>();
  for (const row of overview.counts) {
    const key = row.reason ? `${row.status}: ${row.reason}` : row.status;
    const rule = byRule.get(row.ruleKey) ?? {};
    rule[key] = (rule[key] ?? 0) + row.count;
    byRule.set(row.ruleKey, rule);
  }
  return (
    <section className="admin-card p-4" aria-label="Rules and ledger">
      <h2 className="admin-title">Rules, last 30 days</h2>
      <ul className="admin-stack">
        {overview.rules.map((rule) => (
          <li key={rule.key}>
            <strong>{rule.key}</strong> ({rule.category})
            <span className="admin-lead">
              {" "}
              {Object.entries(byRule.get(rule.key) ?? {})
                .map(([status, n]) => `${status} ${n}`)
                .join(" · ") || "nothing yet"}
            </span>
          </li>
        ))}
      </ul>
      <h3 className="admin-title">Newest ledger rows</h3>
      <ul className="admin-stack">
        {overview.recent.map((row) => (
          <li key={row.id} className="admin-lead">
            {row.updatedAt.slice(0, 16)} · {row.ruleKey} · {row.status}
            {row.reason ? ` (${row.reason})` : ""}
            {row.opens || row.clicks
              ? ` · opens ${row.opens}, clicks ${row.clicks}`
              : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Email: the state of the programme, the templates, broadcasts, the ledger. */
export function EmailScreen() {
  const overview = useAdminJson<Overview>("/api/admin/email/overview");
  return (
    <AdminPage
      title="Email"
      lead="What the engine sends, what it skipped, and the mail itself."
    >
      <div className="admin-stack">
        {overview.error ? (
          <AdminNote tone="danger">{overview.error}</AdminNote>
        ) : null}
        {overview.data ? <Banners overview={overview.data} /> : null}
        <Templates />
        <Broadcasts />
        {overview.data ? <Ledger overview={overview.data} /> : null}
      </div>
    </AdminPage>
  );
}
