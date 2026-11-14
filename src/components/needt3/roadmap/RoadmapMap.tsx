"use client";

import type { CSSProperties } from "react";

import { dayLabel } from "@/lib/needt3/derive";
import {
  type Roadmap,
  type RoadmapEdge,
  type RoadmapStation,
  STATE_LABEL,
  hubStatusLabel,
  waitingLine,
} from "@/lib/needt3/roadmap";

/** One station per row; rows never wrap, so the track and the rows agree. */
export const RM_ROW = 56;
const LANE = 18;
const PAD = 18;

const CLOSED = new Set(["done", "failed", "cancelled"]);

const laneX = (lane: number) => PAD + lane * LANE;
const rowY = (row: number) => row * RM_ROW + RM_ROW / 2;

/** The track between two stations, as an SVG path. */
export function edgePath(
  e: RoadmapEdge,
  at: ReadonlyMap<string, Pick<RoadmapStation, "row" | "lane">>
) {
  const a = at.get(e.from);
  const b = at.get(e.to);
  if (!a || !b) return null;
  const x1 = laneX(a.lane);
  const y1 = rowY(a.row);
  const x2 = laneX(b.lane);
  const y2 = rowY(b.row);
  if (e.kind === "wait") {
    // a further blocker: a dashed arc on the left, clear of the lanes' tracks
    const xl = Math.min(x1, x2) - LANE * 0.8;
    return `M${x1} ${y1}C${xl} ${y1 + RM_ROW * 0.6} ${xl} ${y2 - RM_ROW * 0.6} ${x2} ${y2}`;
  }
  if (x1 === x2) return `M${x1} ${y1}V${y2}`;
  // a fork: leave the parent at once, then run down the new lane
  const bend = y1 + RM_ROW * 0.85;
  return `M${x1} ${y1}C${x1} ${y1 + RM_ROW * 0.5} ${x2} ${y1 + RM_ROW * 0.35} ${x2} ${bend}V${y2}`;
}

function Mark({ s }: { s: RoadmapStation }) {
  const x = laneX(s.lane);
  const y = rowY(s.row);
  switch (s.state) {
    case "done":
      return (
        <g className="rm-mark is-done">
          <circle cx={x} cy={y} r={7.5} className="rm-dot" />
          <path
            d={`M${x - 3.2} ${y + 0.2}l2.2 2.2 4.2-4.4`}
            className="rm-tick"
          />
        </g>
      );
    case "current":
      return (
        <g className="rm-mark is-current">
          <circle cx={x} cy={y} r={7.5} className="rm-pulse" />
          <circle cx={x} cy={y} r={7} className="rm-ring" />
          <circle cx={x} cy={y} r={3} className="rm-dot" />
        </g>
      );
    case "blocked":
      return (
        <g className="rm-mark is-blocked">
          <circle cx={x} cy={y} r={6.5} className="rm-ring" />
          <path
            d={`M${x - 2.5} ${y - 2.5}l5 5M${x + 2.5} ${y - 2.5}l-5 5`}
            className="rm-cross"
          />
        </g>
      );
    default:
      return (
        <g className={`rm-mark is-next${s.upNext ? " is-up" : ""}`}>
          <circle cx={x} cy={y} r={6.5} className="rm-ring" />
        </g>
      );
  }
}

/** The quiet line under a station's title: what holds it, steps, the date. */
function metaOf(s: RoadmapStation) {
  const out: string[] = [];
  const waiting = s.state === "blocked" ? waitingLine(s) : null;
  out.push(
    waiting ??
      (s.state === "next" && s.inProgress
        ? "In progress"
        : s.upNext && s.state === "next"
          ? "Up next"
          : STATE_LABEL[s.state])
  );
  if (s.steps && s.state !== "done")
    out.push(`${s.steps.done} of ${s.steps.total} steps`);
  const due = dayLabel(s.due);
  if (due && s.state !== "done") out.push(due);
  return out;
}

/**
 * The metro map ($skills/plan board.md): milestones are stations on a line in
 * board order, a lane forks where two milestones wait on the same one, and a
 * further blocker joins as a dashed arc. `✓` done, `●` current (a slow pulse,
 * off under reduced motion), `○` next (the proposed one in the project's
 * colour), `✕` blocked. Every station is a button that opens its task.
 * Vertical on every face: the rows read like a list on a phone and the
 * labels never have to be shortened to fit between stations.
 */
export function RoadmapMap({
  roadmap,
  hue,
  onOpen,
  agents = false,
}: {
  roadmap: Roadmap;
  /** The project's colour: the line and the marks. */
  hue: string;
  onOpen: (taskId: string) => void;
  /** Show who works on each milestone (hub items linked to its task). */
  agents?: boolean;
}) {
  const { stations, edges, lanes } = roadmap;
  const at = new Map(stations.map((s) => [s.id, s] as const));
  const width = PAD * 2 + (lanes - 1) * LANE;
  const height = stations.length * RM_ROW;
  const style = {
    "--rm-hue": hue,
    "--rm-gutter": `${width}px`,
    "--rm-row": `${RM_ROW}px`,
  } as CSSProperties;

  return (
    <div className="rm-map" data-rm-map="" style={style}>
      <svg
        className="rm-track"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        focusable="false"
      >
        {edges.map((e) => {
          const d = edgePath(e, at);
          return d ? (
            <path
              key={`${e.from}>${e.to}:${e.kind}`}
              d={d}
              className={`rm-edge is-${e.kind}${e.travelled ? " is-travelled" : ""}`}
            />
          ) : null;
        })}
        {stations.map((s) => (
          <Mark key={s.id} s={s} />
        ))}
      </svg>
      <ol className="rm-stations" role="list" aria-label="Milestones">
        {stations.map((s) => {
          // the newest item still open wins over a newer closed one
          const hub = agents
            ? (s.hub.find((i) => !CLOSED.has(i.status)) ?? s.hub[0])
            : undefined;
          const meta = metaOf(s);
          return (
            <li key={s.id} className="rm-row">
              <button
                type="button"
                className={`rm-station is-${s.state}${s.upNext ? " is-up" : ""}`}
                data-rm-station={s.id}
                data-rm-state={s.state}
                aria-current={s.state === "current" ? "step" : undefined}
                onClick={() => onOpen(s.id)}
              >
                <span className="rm-title">{s.title}</span>
                <span className="rm-meta">
                  {meta.map((m, i) => (
                    <span key={i} className={i ? undefined : "rm-state"}>
                      {m}
                    </span>
                  ))}
                  {hub ? (
                    <span
                      className={`rm-agent is-${hub.status}`}
                      data-rm-agent={hub.id}
                      title={hub.title}
                    >
                      <span aria-hidden="true" className="rm-agent-dot" />
                      {`${hub.agent ?? "Any agent"} · ${hubStatusLabel(hub.status)}`}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** "Now: Billing · Next: Onboarding" — the two names worth reading first. */
export function RoadmapSummary({ roadmap }: { roadmap: Roadmap }) {
  const { current, upNext, stations } = roadmap;
  if (!stations.length) return null;
  const allDone = stations.every((s) => s.state === "done");
  return (
    <p className="rm-summary" data-rm-summary="">
      {allDone ? (
        <span>Every milestone is done</span>
      ) : (
        <>
          {current ? (
            <span>
              <span className="rm-summary-k">Now</span> {current.title}
            </span>
          ) : null}
          {upNext ? (
            <span>
              <span className="rm-summary-k">Next</span> {upNext.title}
            </span>
          ) : null}
          {!current && !upNext ? (
            <span>Everything left is waiting on something</span>
          ) : null}
        </>
      )}
    </p>
  );
}
