"use client";

import { type CSSProperties, useState } from "react";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { type PlanResponse } from "@/lib/needt3/hooks/plan-day";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import {
  useStarterPlanDay,
  useUndoStarterAction,
} from "@/lib/needt3/hooks/starter-game";
import { notify } from "@/lib/notifications";
import type { StarterCreateResult } from "@/lib/starter-game";

import { SgIcon } from "./SgIcon";
import { type SgTile, countTiles, tileDetail } from "./board";
import { sgGroup } from "./model";

/** The list shows this many rows; the counts above it say the rest. */
const LIST_ROWS = 7;

const style = (hue: string, extra?: Record<string, string | number>) =>
  ({ "--hue": hue, ...extra }) as CSSProperties;

/**
 * THE SUMMARY (sg-game.jsx `SgSummary`): what was created, counted and listed,
 * and one primary, Plan my day. Everything is already in Needt, so Later just
 * closes. Plan my day is the existing `POST /api/ai/plan-day`: the scheduler
 * places what has no time yet around the events, and the page shows where each
 * task went, with Undo.
 */
export function SgSummary({
  tiles,
  created,
  onClose,
}: {
  /** The tiles that were made, with the lane each was sorted into. */
  tiles: readonly SgTile[];
  /** What the server made, so a placed task can wear its group's hue. */
  created: StarterCreateResult;
  onClose: () => void;
}) {
  const planDay = useStarterPlanDay();
  const undo = useUndoStarterAction();
  const tz = useTimeZone();
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [undoing, setUndoing] = useState(false);

  const by = (g: SgTile["g"]) => tiles.filter((x) => x.g === g);
  const counts = countTiles(tiles);
  const hueOfTask = (taskId: string) => {
    const made = created.tasks.find((t) => t.id === taskId);
    if (made) return sgGroup(made.group).hue;
    return created.projects.some((p) => p.firstStepTaskId === taskId)
      ? sgGroup("project").hue
      : "var(--sg-ink-3)";
  };
  const rows = [...by("today"), ...by("habit"), ...by("project")].slice(
    0,
    LIST_ROWS
  );

  const run = () =>
    planDay.mutate(undefined, {
      onSuccess: (result) => setPlan(result),
      onError: (error) =>
        notify.error(
          error instanceof Error && error.message
            ? error.message
            : "Could not plan your day."
        ),
    });

  const back = async () => {
    if (!plan?.actionId || undoing) return;
    setUndoing(true);
    try {
      await undo(plan.actionId);
      setPlan(null);
    } catch {
      notify.error("Could not undo the plan.");
    } finally {
      setUndoing(false);
    }
  };

  if (plan) {
    const weekday = formatInTimeZone(newDate(), tz, "EEEE");
    return (
      <div className="sg-sum" data-sg-sum="planned">
        <h2>Your {weekday}, planned.</h2>
        <p>
          {plan.headline}.
          {plan.items.length && !plan.moved ? " Nothing else moved." : ""}
        </p>
        <div className="sg-plan">
          {plan.items.map((s, i) => (
            <div
              key={s.taskId}
              className="sg-plan-r"
              style={style(hueOfTask(s.taskId), { "--i": i })}
            >
              <em>{s.time.split("–")[0]}</em>
              <div>
                {s.title}
                <span>{s.day === "Today" ? s.time : s.day}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="sg-sum-foot">
          <button
            type="button"
            className="sg-btn is-primary is-lg"
            data-sg="open-day"
            onClick={onClose}
          >
            Open my day
          </button>
          {plan.undoable && plan.actionId ? (
            <button
              type="button"
              className="sg-btn is-text"
              data-sg="undo-plan"
              disabled={undoing}
              onClick={() => void back()}
            >
              <SgIcon n="undo" />
              Undo
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="sg-sum" data-sg-sum="done">
      <h2>Done — Needt has it.</h2>
      <p>Everything below is now in Needt. You can change any of it later.</p>
      <div className="sg-counts">
        <div className="sg-count" style={style("var(--sg-today)")}>
          <b>{counts.tasks}</b>
          <span>tasks · {counts.today} today</span>
        </div>
        <div className="sg-count" style={style("var(--sg-habit)")}>
          <b>{counts.habits}</b>
          <span>habits</span>
        </div>
        <div className="sg-count" style={style("var(--sg-project)")}>
          <b>{counts.projects}</b>
          <span>projects</span>
        </div>
      </div>
      <div className="sg-sum-list">
        {rows.map((x) => (
          <div
            key={x.id}
            className="sg-sum-r"
            style={style(sgGroup(x.g ?? x.s).hue)}
          >
            <i />
            {x.t}
            <span>
              {sgGroup(x.g ?? x.s).name} · {tileDetail(x)}
            </span>
          </div>
        ))}
      </div>
      <div className="sg-sum-foot">
        <button
          type="button"
          className="sg-btn is-primary is-lg"
          data-sg="plan-day"
          disabled={planDay.isPending}
          onClick={run}
        >
          {planDay.isPending ? "Planning…" : "Plan my day"}
        </button>
        <button
          type="button"
          className="sg-btn is-text"
          data-sg="later"
          onClick={onClose}
        >
          Later
        </button>
      </div>
    </div>
  );
}
