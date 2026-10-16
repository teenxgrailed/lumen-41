"use client";

import { useState } from "react";

import { SSelect } from "../needt3/settings/kit";
import { dayOf, minuteOf } from "./format";
import { AdminNote, AdminPage } from "./kit";
import { useAdminJson } from "./useAdminJson";

/** What `GET /api/admin/bug-reports` sends for each report. */
export interface AdminBugReport {
  id: string;
  title: string;
  description: string;
  reproductionSteps: string | null;
  expectedBehavior: string | null;
  actualBehavior: string | null;
  severity: string;
  status: string;
  route: string | null;
  appVersion: string | null;
  viewport: string | null;
  theme: string | null;
  browser: string | null;
  githubIssueUrl: string | null;
  githubSyncError: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string | null } | null;
  attachments: Array<{ id: string; fileName: string; size: number }>;
}

const STATUSES = [
  "ALL",
  "OPEN",
  "TRIAGED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
];

const LABEL: Record<string, string> = {
  ALL: "All",
  OPEN: "Open",
  TRIAGED: "Triaged",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

/** Only an https link is drawn as a link; anything else stays plain text. */
function safeHref(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="admin-fact">
      <dt className="admin-meta">{label}</dt>
      <dd className="admin-fact-value admin-prewrap">{value}</dd>
    </div>
  );
}

function Report({ report }: { report: AdminBugReport }) {
  const href = safeHref(report.githubIssueUrl);
  return (
    <dl className="admin-facts admin-bug-detail" data-admin-bug-detail="">
      <Detail label="What happened" value={report.description} />
      <Detail label="Steps" value={report.reproductionSteps} />
      <Detail label="Expected" value={report.expectedBehavior} />
      <Detail label="Actual" value={report.actualBehavior} />
      <Detail
        label="Where"
        value={[report.route, report.browser, report.viewport, report.theme]
          .filter(Boolean)
          .join(" · ")}
      />
      <Detail label="Sync to GitHub" value={report.githubSyncError} />
      {report.attachments.length > 0 ? (
        <Detail
          label="Attachments"
          value={report.attachments.map((a) => a.fileName).join(", ")}
        />
      ) : null}
      {href ? (
        <div className="admin-fact">
          <dt className="admin-meta">GitHub</dt>
          <dd className="admin-fact-value">
            <a
              className="admin-link"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open the issue
            </a>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

/** A read-only list of what people have reported, newest first. */
export function BugsScreen() {
  const { data, error, loading } = useAdminJson<{
    reports: AdminBugReport[];
  }>("/api/admin/bug-reports");
  const [status, setStatus] = useState("ALL");
  const [open, setOpen] = useState<string | null>(null);
  const shown = (data?.reports ?? []).filter(
    (r) => status === "ALL" || r.status === status
  );
  return (
    <AdminPage
      title="Bug reports"
      lead="What people sent from the app, newest first."
      actions={
        <SSelect
          value={status}
          label="Show status"
          width={150}
          options={STATUSES.map((s) => [s, LABEL[s]] as const)}
          onChange={setStatus}
        />
      }
    >
      {error ? <AdminNote tone="danger">{error}</AdminNote> : null}
      {loading && !data ? <AdminNote>Loading…</AdminNote> : null}
      {data && shown.length === 0 ? <AdminNote>No reports.</AdminNote> : null}
      {shown.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table" data-admin-bugs="">
            <thead>
              <tr>
                <th>Sent</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Report</th>
                <th>From</th>
                <th>Build</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((report) => (
                <tr key={report.id} data-admin-bug={report.id}>
                  <td>{dayOf(report.createdAt)}</td>
                  <td>
                    <span className="admin-badge">
                      {LABEL[report.severity] ?? report.severity}
                    </span>
                  </td>
                  <td>
                    <span className="admin-badge">
                      {LABEL[report.status] ?? report.status}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="admin-link-button"
                      aria-expanded={open === report.id}
                      data-admin-bug-toggle=""
                      title={minuteOf(report.createdAt)}
                      onClick={() =>
                        setOpen(open === report.id ? null : report.id)
                      }
                    >
                      {report.title}
                    </button>
                    {open === report.id ? <Report report={report} /> : null}
                  </td>
                  <td>{report.user?.email ?? report.user?.name ?? "-"}</td>
                  <td>{report.appVersion ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </AdminPage>
  );
}
