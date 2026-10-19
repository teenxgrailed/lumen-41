"use client";

import type { CSSProperties } from "react";

import { ProBadge } from "@/components/needt3/paywall/Pro";

import { HaI, haCx } from "./ui";

export interface HaWeekData {
  done: number;
  /** Seven bars, 0..1, in week order; days after `today` are outlines. */
  bars: readonly number[];
  labels: readonly string[];
  today: number;
  /** "Thu · 11" */
  best: string;
  /** Days in a row. */
  streak: number;
}

function Bars({ w }: { w: HaWeekData }) {
  return (
    <>
      <div className="ha-bars" aria-hidden="true">
        {w.bars.map((v, k) => (
          <span
            key={k}
            className={haCx(
              "ha-bar",
              k === w.today && "is-today",
              k > w.today && "is-future"
            )}
            style={{ "--v": v, "--i": k } as CSSProperties}
          />
        ))}
      </div>
      <div className="ha-days" aria-hidden="true">
        {w.labels.map((d, k) => (
          <span key={k} className={k === w.today ? "is-today" : ""}>
            {d}
          </span>
        ))}
      </div>
    </>
  );
}

/** 6 - the This week card: done count, seven bars, best day and streak; opens Stats. */
export function HaWeek({
  w,
  onOpen,
}: {
  w: HaWeekData | null | undefined;
  onOpen?: () => void;
}) {
  if (!w) return null;
  return (
    <div
      className="ha-card ha-week"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.();
        }
      }}
      aria-label={`This week: ${w.done} done, best day ${w.best}, streak ${w.streak} days. Open stats`}
      data-ha-week=""
    >
      <div className="ha-week-h">
        <span className="ha-kicker">This week</span>
        <span className="ha-kicker">
          Stats <HaI n="chev" s={12} />
        </span>
      </div>
      <div className="ha-week-n" style={{ marginTop: 10 }}>
        {w.done}
        <small>done</small>
      </div>
      <Bars w={w} />
      <div className="ha-week-f">
        <span>
          Best <b>{w.best}</b>
        </span>
        <span>
          Streak <b>{w.streak} days</b>
        </span>
      </div>
    </div>
  );
}

export interface HaProject {
  name: string;
  color: string;
  /** 0..1 against the busiest project. */
  v: number;
  k: number;
}

export interface HaKpi {
  b: string;
  span: string;
}

export type HaRange = "Week" | "Month";

/**
 * 6 - the Stats sheet: Week / Month, by project, patterns. Free: the body is
 * blurred behind PRO and one button.
 */
export function HaStats({
  week,
  total,
  totalLabel,
  projects,
  kpis,
  range,
  onRange,
  locked,
  onUpgrade,
}: {
  week: HaWeekData;
  total: number;
  /** "done this week" / "done in October" */
  totalLabel: string;
  projects: readonly HaProject[];
  kpis: readonly HaKpi[];
  range: HaRange;
  onRange: (r: HaRange) => void;
  locked?: boolean;
  onUpgrade?: () => void;
}) {
  const body = (
    <div className="ha-blur-host">
      <div className="ha-week-n">
        {total}
        <small>{totalLabel}</small>
      </div>
      <Bars w={week} />
      <div className="ha-sec-l">By project</div>
      <div className="ha-proj">
        {projects.map((p) => (
          <div key={p.name} className="ha-proj-r">
            <span>
              <i style={{ "--c": p.color } as CSSProperties} />
              {p.name}
            </span>
            <span className="ha-track">
              <span style={{ "--v": p.v } as CSSProperties} />
            </span>
            <em>{p.k}</em>
          </div>
        ))}
      </div>
      <div className="ha-sec-l">Patterns</div>
      <div className="ha-kpis">
        {kpis.map((k) => (
          <div key={k.span} className="ha-kpi">
            <b>{k.b}</b>
            <span>{k.span}</span>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="ha-sheet" role="dialog" aria-label="Stats">
      <div className="ha-grab" />
      <div className="ha-sheet-h ha-stats-h">
        <h3>Stats</h3>
        <div className="ha-seg" style={{ marginTop: 0 }}>
          {(["Week", "Month"] as const).map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={range === o}
              onClick={() => onRange(o)}
            >
              {o}
            </button>
          ))}
        </div>
      </div>
      {locked ? (
        <div className="ha-locked">
          <div className="ha-blur">{body}</div>
          <div className="ha-lock">
            <div className="ha-lock-in">
              <ProBadge size="sm" />
              See where your week went — by project, weekday and focus time.
              <button
                type="button"
                className="ha-btn is-primary"
                onClick={onUpgrade}
              >
                Try Pro free for 14 days
              </button>
            </div>
          </div>
        </div>
      ) : (
        body
      )}
    </div>
  );
}
