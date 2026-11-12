"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ChartMetric, ChartStyle, ChartView } from "@/lib/charts";
import { notify } from "@/lib/notifications";

import { fetchJson, sendJson } from "./core";

/** Every chart read starts with this key, so one write refreshes them all. */
const CHARTS = ["v3", "charts"] as const;

/** Where a chart sits: one project, or Home. */
export type ChartPlace = { projectId: string } | { home: true };

const placeKey = (place: ChartPlace) =>
  "projectId" in place ? place.projectId : "home";

const placeQuery = (place: ChartPlace) =>
  "projectId" in place
    ? `?projectId=${encodeURIComponent(place.projectId)}`
    : "?home=true";

/** `GET /api/charts` for one place, with series. */
export function useCharts(place: ChartPlace, enabled = true) {
  return useQuery({
    queryKey: [...CHARTS, placeKey(place)],
    enabled,
    queryFn: async () =>
      (
        await fetchJson<{ charts: ChartView[] }>(
          `/api/charts${placeQuery(place)}`
        )
      ).charts,
    // The numbers come from tasks, habits and time; refresh them when the
    // person comes back rather than on every render.
    staleTime: 60_000,
  });
}

interface OpAnswer {
  actionId: string | null;
  undoable: boolean;
  result: unknown;
}

export type ChartDraft = {
  metric: ChartMetric;
  projectId?: string;
  habitId?: string;
  title?: string;
  style?: ChartStyle;
  rangeDays?: number;
};

const id = encodeURIComponent;

export const chartRequests = {
  create: (draft: ChartDraft) =>
    sendJson<OpAnswer>("/api/charts", "POST", draft),
  update: ({
    chartId,
    ...patch
  }: { chartId: string } & Record<string, unknown>) =>
    sendJson<OpAnswer>(`/api/charts/${id(chartId)}`, "PATCH", patch),
  remove: ({ chartId }: { chartId: string }) =>
    sendJson<OpAnswer>(`/api/charts/${id(chartId)}`, "DELETE"),
};

/**
 * One chart write: the request, then every chart read refreshes, and a
 * notice with Undo that runs the action log's inverse (null message = quiet).
 */
export function useChartWrite<V>(
  request: (vars: V) => Promise<OpAnswer>,
  message: (vars: V) => string | null
) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: CHARTS });
  return useMutation({
    mutationFn: request,
    onSuccess: (answer, vars) => {
      refresh();
      const text = message(vars);
      if (!text) return;
      notify.success(text, {
        ...(answer.undoable && answer.actionId
          ? {
              action: {
                label: "Undo",
                onClick: () =>
                  void sendJson(
                    `/api/agent/actions/${id(answer.actionId!)}/undo`,
                    "POST"
                  )
                    .then(refresh)
                    .catch(() => notify.error("Could not undo that change.")),
              },
            }
          : {}),
      });
    },
    onError: (error) => {
      const text = error instanceof Error ? error.message : "";
      notify.error(text || "Could not save the chart.");
    },
  });
}
