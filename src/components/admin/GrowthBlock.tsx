"use client";

import type {
  GoalProgress,
  OverviewStats,
} from "@/services/admin/overview-stats";

import { dayOf } from "./format";

function Goal({
  label,
  goal,
  note,
}: {
  label: string;
  goal: GoalProgress;
  note: string;
}) {
  const share = Math.min(100, Math.round((goal.value / goal.target) * 100));
  return (
    <div className="admin-stat" data-admin-goal={label}>
      <span className="admin-stat-label">{label}</span>
      <span className="admin-stat-value">
        {goal.value} / {goal.target}
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
        {goal.met ? "Reached. " : `${goal.daysLeft} days left. `}
        {note}
      </span>
    </div>
  );
}

/**
 * The current launch criteria first (Keep by 30.11, paying by 31.12), the May
 * 2027 goal below as the long view. Goals count external accounts only.
 */
export function GrowthBlock({ stats }: { stats: OverviewStats }) {
  const { goals } = stats;
  return (
    <section className="admin-card" data-admin-growth="">
      <h2 className="admin-section-title">Launch criteria</h2>
      <div className="admin-grid">
        <Goal
          label="Keep pressed"
          goal={goals.keep}
          note={`External users by ${dayOf(goals.keep.deadline)}.`}
        />
        <Goal
          label="Paying"
          goal={goals.paying}
          note={`External accounts with a payment, by ${dayOf(goals.paying.deadline)}.`}
        />
      </div>
      <h3 className="admin-section-title" data-admin-goal-secondary="">
        Long goal, {dayOf(goals.may.weeklyActives.deadline)}
      </h3>
      <div className="admin-grid">
        <Goal
          label="Weekly actives"
          goal={goals.may.weeklyActives}
          note="Seen in the last 7 days."
        />
        <Goal
          label="Paying, long goal"
          goal={goals.may.paying}
          note="Same count as above."
        />
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table" data-admin-growth-trend="">
          <thead>
            <tr>
              <th>Week from</th>
              <th>Users with a product event</th>
            </tr>
          </thead>
          <tbody>
            {stats.weeks.map((week) => (
              <tr key={week.from}>
                <td>{dayOf(week.from)}</td>
                <td>{week.activeUsers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="admin-note">
        The goals ignore the internal toggle: they always count external
        accounts. The weekly table counts users with any recorded product event
        (calendar connected, task created, replan, Keep, Undo, Fill it) in each
        rolling 7 days, so past weeks are real; counting started on 14.11.2026
        and earlier weeks are empty. Weekly actives is the last visit within 7
        days.
      </p>
    </section>
  );
}
