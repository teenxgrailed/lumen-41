"use client";

import { useState } from "react";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  LuChartColumn,
  LuChartLine,
  LuEllipsis,
  LuPlus,
  LuTrash2,
} from "react-icons/lu";

import {
  CHART_H,
  CHART_METRICS,
  CHART_METRIC_LABEL,
  CHART_RANGES,
  CHART_W,
  type ChartMetric,
  type ChartView,
  chartCaption,
  chartShape,
  pointLabel,
} from "@/lib/charts";
import {
  type ChartPlace,
  chartRequests,
  useChartWrite,
  useCharts,
} from "@/lib/needt3/hooks/charts";
import { useHabits } from "@/lib/needt3/hooks/habits";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { useExit } from "../ctx/useExit";

/** Above the floating rail and the shell's sheets, like the project menu. */
const MENU_Z = 1200;

/** The drawing itself: a line or bars in the place's hue, on one baseline. */
export function ChartGraphic({
  chart,
  hue,
}: {
  chart: ChartView;
  hue: string;
}) {
  const series = chart.series;
  if (!series || !series.points.length) return null;
  const shape = chartShape(series.points, chart.style);
  const first = series.points[0].day;
  const last = series.points[series.points.length - 1].day;
  return (
    <svg
      className="ch-svg"
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${chart.title}: ${chartCaption(series.summary)}, ${first} to ${last}`}
      data-ch-svg={chart.style}
      style={{ color: hue }}
    >
      <line
        className="ch-base"
        x1={0}
        x2={CHART_W}
        y1={CHART_H - 0.5}
        y2={CHART_H - 0.5}
        vectorEffect="non-scaling-stroke"
      />
      {shape.totalLine ? (
        <polyline
          className="ch-total"
          points={shape.totalLine}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {chart.style === "line" ? (
        <polyline
          className="ch-line"
          points={shape.line}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        shape.bars.map((b) => {
          const point = series.points.find((p) => p.day === b.day);
          return (
            <rect
              key={b.day}
              className="ch-bar"
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={1}
            >
              {point ? <title>{pointLabel(series.unit, point)}</title> : null}
            </rect>
          );
        })
      )}
    </svg>
  );
}

function ChartMenu({
  chart,
  onPatch,
  onRemove,
}: {
  chart: ChartView;
  onPatch: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
}) {
  const container = useV3PortalContainer();
  const [open, setOpen] = useState(false);
  const [shown, leaving] = useExit(open, 130);
  return (
    <Dropdown.Root open={open} onOpenChange={setOpen} modal={false}>
      <Dropdown.Trigger asChild>
        <button
          type="button"
          aria-label={`${chart.title} options`}
          className="btn-icon btn-ghost ch-more"
          data-ch-more={chart.id}
        >
          <LuEllipsis size={14} aria-hidden />
        </button>
      </Dropdown.Trigger>
      {shown && container ? (
        <Dropdown.Portal container={container} forceMount>
          <Dropdown.Content
            forceMount
            align="end"
            sideOffset={6}
            style={{ position: "relative", zIndex: MENU_Z }}
            className={`nx-pop is-right${leaving ? " is-leaving" : ""}`}
          >
            <div className="nt-menu" style={{ width: 200 }}>
              {CHART_RANGES.map((days) => (
                <Dropdown.CheckboxItem
                  key={days}
                  className="nt-menu-item"
                  checked={chart.rangeDays === days}
                  onSelect={() => onPatch({ rangeDays: days })}
                  data-ch-range={days}
                >
                  Last {days} days
                </Dropdown.CheckboxItem>
              ))}
              <Dropdown.Separator className="nt-menu-sep" />
              <Dropdown.Item
                className="nt-menu-item"
                onSelect={() =>
                  onPatch({ style: chart.style === "line" ? "bar" : "line" })
                }
                data-ch-style=""
              >
                {chart.style === "line" ? (
                  <LuChartColumn size={14} aria-hidden />
                ) : (
                  <LuChartLine size={14} aria-hidden />
                )}
                {chart.style === "line" ? "Show as bars" : "Show as line"}
              </Dropdown.Item>
              <Dropdown.Separator className="nt-menu-sep" />
              <Dropdown.Item
                className="nt-menu-item"
                onSelect={onRemove}
                data-ch-remove=""
              >
                <LuTrash2 size={14} aria-hidden />
                Remove chart
              </Dropdown.Item>
            </div>
          </Dropdown.Content>
        </Dropdown.Portal>
      ) : null}
    </Dropdown.Root>
  );
}

/** One chart block: title, one-line summary, the drawing, the range. */
export function ChartCard({ chart, hue }: { chart: ChartView; hue: string }) {
  const update = useChartWrite(chartRequests.update, () => null);
  const remove = useChartWrite(
    chartRequests.remove,
    () => `Removed “${chart.title}”`
  );
  const series = chart.series;
  return (
    <div
      className="ch-card"
      data-ch-card={chart.id}
      data-ch-metric={chart.metric}
    >
      <div className="ch-head">
        <span className="ch-title" title={chart.title}>
          {chart.title}
        </span>
        {series ? (
          <span className="ch-caption">{chartCaption(series.summary)}</span>
        ) : null}
        <ChartMenu
          chart={chart}
          onPatch={(patch) => update.mutate({ chartId: chart.id, ...patch })}
          onRemove={() => remove.mutate({ chartId: chart.id })}
        />
      </div>
      <ChartGraphic chart={chart} hue={hue} />
      <div className="ch-foot">
        <span>{chart.rangeDays} days</span>
        <span>today</span>
      </div>
    </div>
  );
}

/** "Add chart": one row per metric; habit streak lists the habits in scope. */
function AddChart({ place, count }: { place: ChartPlace; count: number }) {
  const container = useV3PortalContainer();
  const [open, setOpen] = useState(false);
  const [shown, leaving] = useExit(open, 130);
  const projectId = "projectId" in place ? place.projectId : undefined;
  const habits = useHabits();
  const inScope = (habits.data ?? []).filter(
    (h) => !h.archivedAt && (!projectId || h.projectId === projectId)
  );
  const create = useChartWrite(chartRequests.create, (draft) =>
    draft.title ? `Added “${draft.title}”` : "Chart added"
  );
  const add = (metric: ChartMetric, habit?: { id: string; title: string }) =>
    create.mutate({
      metric,
      ...(projectId ? { projectId } : {}),
      ...(habit ? { habitId: habit.id, title: habit.title } : {}),
      title: habit?.title ?? CHART_METRIC_LABEL[metric],
    });
  return (
    <Dropdown.Root open={open} onOpenChange={setOpen} modal={false}>
      <Dropdown.Trigger asChild>
        <button
          type="button"
          className={`ch-add nx-press nx-focus${count ? "" : " is-empty"}`}
          data-ch-add=""
          disabled={create.isPending}
        >
          <LuPlus size={14} aria-hidden />
          Add chart
        </button>
      </Dropdown.Trigger>
      {shown && container ? (
        <Dropdown.Portal container={container} forceMount>
          <Dropdown.Content
            forceMount
            align="start"
            sideOffset={6}
            style={{ position: "relative", zIndex: MENU_Z }}
            className={`nx-pop${leaving ? " is-leaving" : ""}`}
          >
            <div className="nt-menu" style={{ width: 220 }}>
              {CHART_METRICS.map((metric) => (
                <Dropdown.Item
                  key={metric}
                  className="nt-menu-item"
                  onSelect={() => add(metric)}
                  data-ch-add-metric={metric}
                >
                  {metric === "habit_streak"
                    ? projectId
                      ? "Habit streak · this project"
                      : "Habit streak · all habits"
                    : CHART_METRIC_LABEL[metric]}
                </Dropdown.Item>
              ))}
              {inScope.length ? (
                <Dropdown.Separator className="nt-menu-sep" />
              ) : null}
              {inScope.slice(0, 8).map((h) => (
                <Dropdown.Item
                  key={h.id}
                  className="nt-menu-item"
                  onSelect={() => add("habit_streak", h)}
                  data-ch-add-habit={h.id}
                >
                  Streak · {h.title}
                </Dropdown.Item>
              ))}
            </div>
          </Dropdown.Content>
        </Dropdown.Portal>
      ) : null}
    </Dropdown.Root>
  );
}

/**
 * The charts of one place (a project, or Home), and the way to add one.
 * With none yet, only the quiet "Add chart" row shows.
 */
export function ChartsSection({
  place,
  hue,
}: {
  place: ChartPlace;
  hue: string;
}) {
  const charts = useCharts(place);
  if (!charts.data) return null;
  return (
    <div
      className="ch-section"
      data-ch-section={"projectId" in place ? "project" : "home"}
    >
      {charts.data.length ? (
        <div className="ch-grid">
          {charts.data.map((c) => (
            <ChartCard key={c.id} chart={c} hue={hue} />
          ))}
        </div>
      ) : null}
      <AddChart place={place} count={charts.data.length} />
    </div>
  );
}
