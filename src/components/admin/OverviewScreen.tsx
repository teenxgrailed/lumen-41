"use client";

import type { AdminOverview } from "@/services/admin/overview";

import { AdminNote, AdminPage } from "./kit";
import { useAdminJson } from "./useAdminJson";

interface OverviewResponse {
  overview: AdminOverview;
  build: { buildSha: string; workerBuildSha: string | null };
}

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
  const { data, error, loading } = useAdminJson<OverviewResponse>(
    "/api/admin/overview"
  );
  const o = data?.overview;
  const build = data?.build;
  const workerBehind =
    build && build.workerBuildSha !== null
      ? build.workerBuildSha !== build.buildSha
      : false;
  return (
    <AdminPage title="Overview" lead="Who is in Needt and what is running.">
      {error ? <AdminNote tone="danger">{error}</AdminNote> : null}
      {loading && !data ? <AdminNote>Loading…</AdminNote> : null}
      {o ? (
        <>
          <div className="admin-grid">
            <Stat label="Users" value={o.users.total} />
            <Stat label="New in 7 days" value={o.users.newLast7Days} />
            <Stat label="Active trials" value={o.activeTrials} />
            <Stat label="Pro" value={o.plans.pro} />
            <Stat label="Lifetime" value={o.plans.lifetime} />
            <Stat label="Free" value={o.plans.free} />
            <Stat label="Waitlist" value={o.waitlist} />
          </div>
          <p className="admin-note">
            Free is everyone who is neither paid nor inside a trial. New users
            count from the day the account was created; older accounts without a
            date are not in that figure.
          </p>
        </>
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
