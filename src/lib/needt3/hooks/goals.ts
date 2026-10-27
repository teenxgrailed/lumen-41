"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { GoalCheckInView, GoalView } from "@/lib/goals";
import { notify } from "@/lib/notifications";

import { fetchJson, sendJson } from "./core";

/** Every goal read starts with this key, so one write refreshes them all. */
const GOALS = ["v3", "goals"] as const;
const TASKS = ["v3", "tasks"] as const;

export interface GoalTaskView {
  id: string;
  title: string;
  status: string;
  goalId: string | null;
  projectId: string | null;
}

export interface GoalDetail {
  goal: GoalView;
  subgoals: GoalView[];
  tasks: GoalTaskView[];
  checkIns: GoalCheckInView[];
}

/** `GET /api/goals` (all statuses), optionally the goals of one project. */
export function useGoals(
  filter: { projectId?: string; enabled?: boolean } = {}
) {
  const query = filter.projectId
    ? `?projectId=${encodeURIComponent(filter.projectId)}`
    : "";
  return useQuery({
    queryKey: [...GOALS, "list", filter.projectId ?? null],
    enabled: filter.enabled ?? true,
    queryFn: async () =>
      (await fetchJson<{ goals: GoalView[] }>(`/api/goals${query}`)).goals,
  });
}

export function useGoal(id: string | null) {
  return useQuery({
    queryKey: [...GOALS, "one", id],
    enabled: !!id,
    queryFn: () =>
      fetchJson<GoalDetail>(`/api/goals/${encodeURIComponent(id ?? "")}`),
  });
}

interface OpAnswer {
  actionId: string | null;
  undoable: boolean;
  result: unknown;
}

/**
 * One goal write: the request, then every goal (and task) read refreshes,
 * and a notice with Undo that runs the action log's inverse.
 */
export function useGoalWrite<V>(
  request: (vars: V) => Promise<OpAnswer>,
  message: (vars: V) => string | null
) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: GOALS });
    void qc.invalidateQueries({ queryKey: TASKS });
  };
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
                    `/api/agent/actions/${answer.actionId}/undo`,
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
      notify.error(text || "Could not save the goal.");
    },
  });
}

export type GoalDraft = {
  title: string;
  description?: string;
  deadline?: string;
  area?: string;
  parentId?: string;
  projectIds?: string[];
  targetValue?: number;
  currentValue?: number;
  unit?: string;
};

const id = encodeURIComponent;

/** Task → goal (`goal.convert_from_task`); the answer carries `actionId`. */
export const convertTaskToGoal = (taskId: string) =>
  sendJson<OpAnswer>("/api/goals/convert-task", "POST", { taskId });

/** Undo one logged action (a goal write or a conversion). */
export const undoGoalAction = async (actionId: string | null) => {
  if (!actionId) return;
  await sendJson(
    `/api/agent/actions/${encodeURIComponent(actionId)}/undo`,
    "POST"
  );
};

export const goalRequests = {
  create: (draft: GoalDraft) => sendJson<OpAnswer>("/api/goals", "POST", draft),
  update: ({
    goalId,
    ...patch
  }: { goalId: string } & Record<string, unknown>) =>
    sendJson<OpAnswer>(`/api/goals/${id(goalId)}`, "PATCH", patch),
  archive: ({ goalId }: { goalId: string }) =>
    sendJson<OpAnswer>(`/api/goals/${id(goalId)}`, "DELETE"),
  checkIn: ({
    goalId,
    ...body
  }: {
    goalId: string;
    value?: number;
    percent?: number;
    note?: string;
  }) => sendJson<OpAnswer>(`/api/goals/${id(goalId)}/check-ins`, "POST", body),
  addTask: ({ goalId, title }: { goalId: string; title: string }) =>
    sendJson<OpAnswer>(`/api/goals/${id(goalId)}/tasks`, "POST", { title }),
  linkTask: ({ goalId, taskId }: { goalId: string; taskId: string }) =>
    sendJson<OpAnswer>(`/api/goals/${id(goalId)}/tasks`, "POST", { taskId }),
  setTask: ({
    goalId,
    taskId,
    ...body
  }: {
    goalId: string;
    taskId: string;
    done?: boolean;
    linked?: false;
  }) =>
    sendJson<OpAnswer>(
      `/api/goals/${id(goalId)}/tasks/${id(taskId)}`,
      "PATCH",
      body
    ),
};
