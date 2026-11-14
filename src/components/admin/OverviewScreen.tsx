"use client";

import type { AdminActivation } from "@/services/admin/activation";
import type { AdminAgentsHub } from "@/services/admin/agents-hub";
import type { AdminGrowth } from "@/services/admin/growth";
import type { AdminOverview } from "@/services/admin/overview";

import { GrowthBlock } from "./GrowthBlock";
import { AdminNote, AdminPage } from "./kit";
import { useAdminJson } from "./useAdminJson";

interface OverviewResponse {
  overview: AdminOverview;
  build: { buildSha: string; workerBuildSha: string | null };
  growth?: AdminGrowth;
}

const EVENT_LABELS: Record<AdminActivation["events"][number]["name"], string> =
  {
    account_created: "Account created",
    calendar_connected: "Calendar connected",
    task_created: "Task created",
    replan_shown: "Replan shown",
    keep_applied: "Keep pressed",
    undo_applied: "Undo pressed",
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
  const { data, error, loading } = useAdminJson<OverviewResponse>(
    "/api/admin/overview"
  );
  const hub = useAdminJson<{ agentsHub: AdminAgentsHub }>(
    "/api/admin/agents-hub"
  );
  const activation = useAdminJson<{ activation: AdminActivation }>(
    "/api/admin/activation"
  );
  const a = activation.data?.activation;
  const h = hub.data?.agentsHub;
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
      {data?.growth ? <GrowthBlock growth={data.growth} /> : null}
      {activation.error ? (
        <AdminNote tone="danger">{activation.error}</AdminNote>
      ) : null}
      {a ? (
        <section className="admin-card" data-admin-activation="">
          <h2 className="admin-section-title">Activation, external users</h2>
          <div className="admin-grid">
            {a.events.map((event) => (
              <Stat
                key={event.name}
                label={`${EVENT_LABELS[event.name]}, 7 / 14 days`}
                value={`${event.users7Days} / ${event.users14Days}`}
              />
            ))}
          </div>
          <p className="admin-note">
            Distinct users per event. Admin and sandbox accounts are not
            counted. Counting started when this shipped. Keep is the launch
            criterion: fewer than 5 external users by 30.11 means the segment or
            onboarding changes.
          </p>
        </section>
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
