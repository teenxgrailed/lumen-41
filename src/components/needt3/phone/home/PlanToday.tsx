"use client";

import { type ReactNode, useState } from "react";

import {
  type DayPlanSnapshot,
  planLine,
  planSections,
} from "@/lib/needt3/day-plan";
import type { V3Task } from "@/lib/needt3/map";

import { PkButton, PkSection } from "../kit";

/**
 * Today from the plan: the main tasks, the rest of the plan, a folded "Needs a
 * decision" group, one quiet line with the limits, and the way to the full
 * list and to Someday. Rows are the screen's own (`row`); this only arranges
 * them. Plain on purpose: the look is the design's to give.
 */
export function PlanToday({
  snapshot,
  byId,
  row,
  allCount,
  allOpen,
  onAll,
  onSomeday,
}: {
  snapshot: DayPlanSnapshot;
  byId: ReadonlyMap<string, V3Task>;
  row: (t: V3Task) => ReactNode;
  /** Open tasks outside the plan (overdue, Inbox): the full list. */
  allCount: number;
  allOpen: boolean;
  onAll: () => void;
  onSomeday: () => void;
}) {
  const [decideFolded, setDecideFolded] = useState(true);
  const { main, rest, needsDecision } = planSections(snapshot);
  const rows = (items: typeof main) =>
    items.flatMap((i) => {
      const t = byId.get(i.taskId);
      return t ? [row(t)] : [];
    });
  return (
    <div className="v2p-day" data-day-plan="">
      {main.length ? (
        <PkSection title="Main" count={main.length}>
          {rows(main)}
        </PkSection>
      ) : null}
      {rest.length ? (
        <PkSection title="The rest of the plan" count={rest.length}>
          {rows(rest)}
        </PkSection>
      ) : null}
      {snapshot.plan ? (
        <p className="ha-meta" data-day-plan-line="">
          {planLine(snapshot.plan)}
        </p>
      ) : null}
      {needsDecision.length ? (
        <PkSection
          title="Needs a decision"
          count={needsDecision.length}
          folded={decideFolded}
          onFold={() => setDecideFolded((f) => !f)}
        >
          {needsDecision.map((t) => {
            const task = byId.get(t.id);
            return task ? (
              row(task)
            ) : (
              <div key={t.id} className="ha-left">
                <div className="ha-left-t">
                  <b>{t.title}</b>
                </div>
              </div>
            );
          })}
        </PkSection>
      ) : null}
      <div data-day-plan-links="">
        {allCount ? (
          <PkButton kind="chip" onClick={onAll}>
            {allOpen ? "Hide the full list" : `All tasks · ${allCount}`}
          </PkButton>
        ) : null}
        <PkButton kind="chip" onClick={onSomeday}>
          Someday
        </PkButton>
      </div>
    </div>
  );
}
