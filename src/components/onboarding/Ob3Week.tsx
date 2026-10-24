"use client";

import { areaById } from "@/lib/onboarding/catalog";
import { dur, hhmm } from "@/lib/onboarding/format";
import type { WeekPlan } from "@/lib/onboarding/plan";

import { cx3 } from "./ob3-ui";

const colorOf = (area: string) => areaById(area)?.color ?? "#64748b";

/** The week: events, a scan, task outlines, then tasks. `phase` 0..5. */
export function Week({
  plan,
  phase,
  pick,
  onPick,
}: {
  plan: WeekPlan;
  phase: number;
  pick?: string | null;
  onPick?: (key: string | null) => void;
}) {
  const weekend = plan.days.some((d) => d.day > 4);
  const lo = plan.range.lo;
  const hi = plan.range.hi;
  const H = Math.max(1, hi - lo);
  const y = (t: number) => ((t - lo) / H) * 100;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo); t <= hi; t += H > 10 ? 3 : 2) ticks.push(t);
  void weekend;
  return (
    <div
      className={cx3("ob3-week", "ph-" + phase)}
      style={{ "--cols": plan.days.length } as never}
    >
      <div className="ob3-wk-head">
        <span />
        {plan.days.map((d) => (
          <span key={d.day} className={d.day > 4 ? "we" : ""}>
            <b>{d.short}</b>
            <small>{d.n}</small>
          </span>
        ))}
      </div>
      <div className="ob3-wk-body">
        <div className="ob3-wk-axis">
          {ticks.map((t) => (
            <span key={t} style={{ top: y(t) + "%" }}>
              {hhmm(t)}
            </span>
          ))}
        </div>
        {plan.days.map((d, di) => (
          <div
            key={d.day}
            className={cx3("ob3-wk-col", d.day > 4 && "we")}
            style={{ "--c": di } as never}
          >
            {ticks.map((t) => (
              <i key={t} className="ob3-wk-line" style={{ top: y(t) + "%" }} />
            ))}
            {plan.events
              .filter((e) => e.day === d.day && e.end > lo && e.start < hi)
              .map((e, k) => (
                <span
                  key={k}
                  className="ob3-ev"
                  style={
                    {
                      top: y(Math.max(lo, e.start)) + "%",
                      height:
                        ((Math.min(hi, e.end) - Math.max(lo, e.start)) / H) *
                          100 +
                        "%",
                      "--d": (di * 2 + k) * 60 + "ms",
                    } as never
                  }
                >
                  <em>{e.title}</em>
                </span>
              ))}
            {plan.placed
              .filter((p) => p.day === d.day)
              .map((p, k) => (
                <button
                  type="button"
                  key={p.key}
                  className={cx3("ob3-tk", pick === p.key && "is-pick")}
                  onClick={() => onPick?.(pick === p.key ? null : p.key)}
                  style={
                    {
                      top: y(p.start) + "%",
                      height:
                        Math.max(2.4, ((p.end - p.start) / H) * 100) + "%",
                      "--cc": colorOf(p.area),
                      "--d": di * 90 + k * 70 + "ms",
                    } as never
                  }
                  aria-label={`${p.title}, ${d.long} ${hhmm(p.start)}`}
                >
                  <em>{p.title}</em>
                </button>
              ))}
          </div>
        ))}
      </div>
      {plan.source === "sample" ? (
        <span className="ob3-wk-sample">Sample calendar</span>
      ) : null}
    </div>
  );
}

export function DayList({
  plan,
  pick,
  onPick,
}: {
  plan: WeekPlan;
  pick: string | null;
  onPick: (key: string | null) => void;
}) {
  return (
    <div className="ob3-days">
      {plan.days.map((d, di) => {
        const items = [
          ...plan.placed
            .filter((p) => p.day === d.day)
            .map((p) => ({
              key: p.key,
              s: p.start,
              e: p.end,
              t: p.title,
              part: p.part,
              area: p.area,
              m: p.minutes,
              task: true,
            })),
          ...plan.events
            .filter((e) => e.day === d.day)
            .map((e) => ({
              key: "ev-" + e.start + e.title,
              s: e.start,
              e: e.end,
              t: e.title,
              part: "",
              area: "",
              m: Math.round((e.end - e.start) * 60),
              task: false,
            })),
        ].sort((a, b) => a.s - b.s);
        return (
          <section
            key={d.day}
            className="ob3-day"
            style={{ "--i": di } as never}
          >
            <h3>
              {d.long}{" "}
              <small>
                {d.n} {d.mon}
              </small>
            </h3>
            <div className="ob3-daychips">
              {items.map((it) =>
                it.task ? (
                  <button
                    type="button"
                    key={it.key}
                    className={cx3("ob3-li", pick === it.key && "is-pick")}
                    style={{ "--cc": colorOf(it.area) } as never}
                    onClick={() => onPick(pick === it.key ? null : it.key)}
                  >
                    <small>{hhmm(it.s)}</small>
                    <i />
                    <b>
                      {it.t}
                      {it.part ? <span> · part {it.part}</span> : null}
                    </b>
                    <span className="dur">{dur(it.m)}</span>
                  </button>
                ) : (
                  <div key={it.key} className="ob3-li ev">
                    <small>{hhmm(it.s)}</small>
                    <i />
                    <b>{it.t}</b>
                    <span className="dur">{dur(it.m)}</span>
                  </div>
                )
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
