"use client";

import { useState } from "react";

import type { AdminAgentsHub } from "@/services/admin/agents-hub";
import type { OverviewStats } from "@/services/admin/overview-stats";

import { GrowthBlock } from "./GrowthBlock";
import { AdminNote, AdminPage } from "./kit";
import { useAdminJson } from "./useAdminJson";

interface OverviewResponse {
  stats: OverviewStats;
  build: { buildSha: string; workerBuildSha: string | null };
}

const STEP_LABELS: Record<string, string> = {
  account_created: "Account created",
  calendar_connected: "Calendar connected",
  task_created: "Task created",
  replan_shown: "Replan shown",
  keep_applied: "Keep pressed",
  undo_applied: "Undo pressed",
  fill_applied: "Fill it used",
  first_replan_card_shown: "First replan card shown",
  first_replan_skipped: "First replan skipped",
};

function shortSha(sha: string | null): string {
  if (!sha) return "unknown";
  return /^[0-9a-f]{40}$/i.test(sha) ? sha.slice(0, 7) : sha;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="admin-stat" data-admin-stat={label}>
      <span className="admin-stat-label">{label}</span>
      <span className="admin-stat-value">{value}</span>
    </div>
  );
}

/** The cheap counts and the running build. Nothing here scans a content table. */
export function OverviewScreen() {
  const [excludeInternal, setExcludeInternal] = useState(true);
  const { data, error, loading } = useAdminJson<OverviewResponse>(
    excludeInternal
      ? "/api/admin/overview"
      : "/api/admin/overview?internal=include"
  );
  const hub = useAdminJson<{ agentsHub: AdminAgentsHub }>(
    "/api/admin/agents-hub"
  );
  const h = hub.data?.agentsHub;
  const o = data?.stats;
  const build = data?.build;
  const workerBehind =
    build && build.workerBuildSha !== null
      ? build.workerBuildSha !== build.buildSha
      : false;
  return (
    <AdminPage
      title="Overview"
      lead="Who is in Needt and what is running."
      actions={
        <label className="admin-meta" data-admin-internal-toggle="">
          <input
            type="checkbox"
            checked={excludeInternal}
            onChange={(event) => setExcludeInternal(event.target.checked)}
          />{" "}
          Exclude internal accounts
          {o ? ` (${o.internal.accounts})` : ""}
        </label>
      }
    >
      {error ? <AdminNote tone="danger">{error}</AdminNote> : null}
      {loading && !data ? <AdminNote>Loading…</AdminNote> : null}
      {o ? (
        <>
          <div className="admin-grid">
            <Stat label="Users" value={o.users.total} />
            <Stat label="New in 7 days" value={o.users.newLast7Days} />
            <Stat label="Active trials" value={o.activeTrials} />
            <Stat label="Paying" value={o.paying.total} />
            <Stat label="Granted" value={o.granted.total} />
            <Stat label="Free" value={o.free} />
            <Stat label="Weekly actives" value={o.weeklyActives} />
            <Stat label="Waitlist" value={o.waitlist} />
          </div>
          <p className="admin-note" data-admin-overview-note="">
            Paying is a successful payment (Creem, or a live App Store
            subscription), not a plan: {o.paying.total} paid,{" "}
            {o.paying.activeNow} still on the plan. Granted is Pro or Lifetime
            given by hand (Pro {o.granted.pro}, Lifetime {o.granted.lifetime},
            gifts {o.granted.gifts}) and never counts as paying. Free is
            everyone with no plan, grant or trial.{" "}
            {excludeInternal
              ? `${o.internal.accounts} internal accounts are left out of every number (${o.internal.weeklyActives} of them were active this week).`
              : "Internal accounts are included in these numbers."}{" "}
            New users count from the day the account was created; older accounts
            without a date are not in that figure.
          </p>
          <section className="admin-card" data-admin-activation="">
            <h2 className="admin-section-title">Activation funnel</h2>
            <div className="admin-table-wrap">
              <table className="admin-table" data-admin-funnel="">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>7 days</th>
                    <th>30 days</th>
                  </tr>
                </thead>
                <tbody>
                  {o.funnel.map((step) => (
                    <tr key={step.name} data-admin-funnel-step={step.name}>
                      <td>{STEP_LABELS[step.name]}</td>
                      <td>{step.users7Days}</td>
                      <td>{step.users30Days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="admin-note">
              Distinct users who did the step in the window, so a later step can
              be higher than an earlier one (the person signed up before the
              window). Also seen:{" "}
              {o.sideEvents
                .map(
                  (event) =>
                    `${STEP_LABELS[event.name]} ${event.users7Days} / ${event.users30Days}`
                )
                .join(", ")}
              . Counting started on 14.11.2026.
            </p>
          </section>
          <GrowthBlock stats={o} />
        </>
      ) : null}
      {hub.error ? <AdminNote tone="danger">{hub.error}</AdminNote> : null}
      {h ? (
        <section className="admin-card" data-admin-agents-hub="">
          <h2 className="admin-section-title">Agents hub</h2>
          <div className="admin-grid">
            <Stat
              label="Accounts with an agent, 7 days"
              value={h.accountsWithAgent7Days}
            />
            <Stat
              label="Accounts with an agent, 30 days"
              value={h.accountsWithAgent30Days}
            />
            <Stat
              label="Completed by agents, 7 days"
              value={h.itemsCompletedByAgents7Days}
            />
            <Stat
              label="Escalations answered, 7 days"
              value={h.escalationsAnswered7Days}
            />
          </div>
          <p className="admin-note">
            An account counts when it registered an agent in the window; the
            built-in assistant does not count.
          </p>
        </section>
      ) : null}
      {build ? (
        <section className="admin-card" data-admin-build="">
          <div className="admin-grid">
            <Stat label="App build" value={shortSha(build.buildSha)} />
            <Stat label="Worker build" value={shortSha(build.workerBuildSha)} />
          </div>
          {workerBehind ? (
            <AdminNote tone="danger">
              The worker reports a different build than the app.
            </AdminNote>
          ) : null}
        </section>
      ) : null}
    </AdminPage>
  );
}
