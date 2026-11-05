"use client";

import type { AdminGrowth } from "@/services/admin/growth";

import { dayOf } from "./format";

function Goal({
  label,
  value,
  target,
  perWeek,
  note,
}: {
  label: string;
  value: number;
  target: number;
  perWeek: number;
  note: string;
}) {
  const share = Math.min(100, Math.round((value / target) * 100));
  return (
    <div className="admin-stat" data-admin-goal={label}>
      <span className="admin-stat-label">{label}</span>
      <span className="admin-stat-value">
        {value} / {target}
      </span>
      <span
        className="admin-bar"
        role="progressbar"
        aria-label={`${label}, ${share}% of target`}
        aria-valuenow={share}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${share}%` }} />
      </span>
      <span className="admin-meta">
        {perWeek > 0 ? `${perWeek} more a week needed. ` : "Target reached. "}
        {note}
      </span>
    </div>
  );
}

/**
 * Weekly actives and paying people against the 05.05.2027 goal. Trials are
 * shown apart and never added to paying; the trend is eight rolling weeks.
 */
export function GrowthBlock({ growth }: { growth: AdminGrowth }) {
  const { goal } = growth;
  return (
    <section className="admin-card" data-admin-growth="">
      <h2 className="admin-section-title">Growth to {dayOf(goal.deadline)}</h2>
      <div className="admin-grid">
        <Goal
          label="Weekly actives"
          value={growth.weeklyActives}
          target={goal.weeklyActives}
          perWeek={growth.neededPerWeek.weeklyActives}
          note="Active in the last 7 days."
        />
        <Goal
          label="Paying"
          value={growth.paying.total}
          target={goal.paying}
          perWeek={growth.neededPerWeek.paying}
          note={`Pro ${growth.paying.pro}, Lifetime ${growth.paying.lifetime}.`}
        />
        <div className="admin-stat" data-admin-stat="In a trial, not paying">
          <span className="admin-stat-label">In a trial, not paying</span>
          <span className="admin-stat-value">{growth.activeTrials}</span>
        </div>
        <div className="admin-stat" data-admin-stat="Days to checkpoint">
          <span className="admin-stat-label">
            Checkpoint {dayOf(goal.checkpoint)}
          </span>
          <span className="admin-stat-value">
            {Math.max(0, growth.daysToCheckpoint)} days
          </span>
          <span className="admin-meta">
            {Math.max(0, growth.daysToDeadline)} days to the goal.
          </span>
        </div>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table" data-admin-growth-trend="">
          <thead>
            <tr>
              <th>Week from</th>
              <th>Last seen in week</th>
              <th>New paying</th>
            </tr>
          </thead>
          <tbody>
            {growth.weeks.map((week) => (
              <tr key={week.from}>
                <td>{dayOf(week.from)}</td>
                <td>{week.lastSeen}</td>
                <td>{week.newPaying}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="admin-note">
        Paying is a Pro or Lifetime subscription that still holds its plan;
        trials are not in it. Activity keeps only the latest visit, so older
        weeks show who was last seen then and understate; the newest week is the
        weekly-actives number. Sandbox accounts are left out of actives.
      </p>
    </section>
  );
}
