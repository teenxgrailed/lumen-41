"use client";

import { useState } from "react";

import type { FeedbackSummary } from "@/services/feedback/feedback-service";

import { SSelect } from "../needt3/settings/kit";
import { minuteOf } from "./format";
import { AdminNote, AdminPage } from "./kit";
import { useAdminJson } from "./useAdminJson";

interface FeedbackItem {
  id: string;
  kind: string;
  shownAt: string;
  answeredAt: string | null;
  dismissedAt: string | null;
  rating: number | null;
  score: number | null;
  text: string | null;
  platform: string;
  appVersion: string | null;
  email: string | null;
}

const KINDS: readonly (readonly [string, string])[] = [
  ["", "All questions"],
  ["rating", "Rating"],
  ["idea", "What should we add"],
  ["annoyance", "Missing or annoying"],
  ["nps", "NPS"],
];

const KIND_LABEL = new Map(KINDS);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-stat" data-admin-stat={label}>
      <span className="admin-stat-label">{label}</span>
      <span className="admin-stat-value">{value}</span>
    </div>
  );
}

function answerOf(item: FeedbackItem): string {
  if (item.rating !== null) return `${item.rating} / 5`;
  if (item.score !== null) return `${item.score} / 10`;
  return "";
}

function stateOf(item: FeedbackItem): string {
  if (item.answeredAt) return "Answered";
  if (item.dismissedAt) return "Dismissed";
  return "Ignored";
}

/**
 * What people answered in the in-app feedback prompt: the averages over the
 * filter, then the newest 200 answers. This is the only place the answers are
 * shown; they create no tasks and send no mail.
 */
export function FeedbackScreen() {
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query = new URLSearchParams();
  if (kind) query.set("kind", kind);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) query.set("from", from);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) query.set("to", to);
  const { data, error, loading } = useAdminJson<{
    summary: FeedbackSummary;
    items: FeedbackItem[];
  }>(`/api/admin/feedback?${query}`);
  const s = data?.summary;
  const num = (value: number | null, suffix = "") =>
    value === null ? "-" : `${value}${suffix}`;
  return (
    <AdminPage
      title="Feedback"
      lead="Answers to the occasional in-app question. Dates are UTC."
    >
      <div className="admin-toolbar" role="search">
        <SSelect
          label="Question"
          value={kind}
          options={KINDS}
          width={220}
          align="start"
          onChange={setKind}
        />
        <input
          className="nt-input"
          type="date"
          value={from}
          aria-label="From"
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          className="nt-input"
          type="date"
          value={to}
          aria-label="To"
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      {error ? <AdminNote tone="danger">{error}</AdminNote> : null}
      {loading && !data ? <AdminNote>Loading…</AdminNote> : null}
      {s ? (
        <div className="admin-grid">
          <Stat label="Shown" value={String(s.shown)} />
          <Stat label="Answered" value={String(s.answered)} />
          <Stat label="Dismissed" value={String(s.dismissed)} />
          <Stat
            label={`Average rating (${s.ratingCount})`}
            value={num(s.avgRating, " / 5")}
          />
          <Stat
            label={`Average score (${s.npsCount})`}
            value={num(s.avgScore, " / 10")}
          />
          <Stat label="NPS" value={num(s.nps)} />
        </div>
      ) : null}
      {data && data.items.length === 0 ? (
        <AdminNote>No prompts match.</AdminNote>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table" data-admin-feedback="">
            <thead>
              <tr>
                <th>Shown (UTC)</th>
                <th>Person</th>
                <th>Question</th>
                <th>State</th>
                <th>Answer</th>
                <th>Text</th>
                <th>Platform</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>{minuteOf(item.shownAt)}</td>
                  <td>{item.email ?? "-"}</td>
                  <td>{KIND_LABEL.get(item.kind) ?? item.kind}</td>
                  <td>
                    <span className="admin-badge">{stateOf(item)}</span>
                  </td>
                  <td>{answerOf(item)}</td>
                  <td>{item.text ?? ""}</td>
                  <td>
                    {item.platform}
                    {item.appVersion ? ` ${item.appVersion}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {data && data.items.length >= 200 ? (
        <AdminNote>
          Showing the newest 200. Narrow the dates to see others.
        </AdminNote>
      ) : null}
    </AdminPage>
  );
}
