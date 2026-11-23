"use client";

import { useEffect, useRef } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { useAppSession } from "@/components/providers/app-session-context";

import { logger } from "@/lib/logger";
import {
  announceEasyStart,
  parseEasyStart,
} from "@/lib/needt3/easy-start-notice";
import {
  loadProposals,
  useRecentSimplified,
} from "@/lib/needt3/easy-start-row";
import { announceEarlyFinish, parseFocusEnded } from "@/lib/needt3/focus-early";
import { sendJson } from "@/lib/needt3/hooks/core";
import { useUpdateTask } from "@/lib/needt3/hooks/tasks";
import { announceIdeaCards, parseIdeaCards } from "@/lib/needt3/idea-notice";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";
import {
  INITIAL_REALTIME_RECONNECT_DELAY_MS,
  nextRealtimeReconnectDelay,
} from "@/lib/realtime/reconnect";

import { useCalendarStore } from "@/store/calendar";
import { useTaskStore } from "@/store/task";

const LOG_SOURCE = "RealtimeSyncHook";

/** v3 caches a `tasks-updated` event makes stale: lists, one task, habits. */
export const REALTIME_TASK_QUERY_KEYS = [
  qk.tasks(),
  [...qk.task("")].slice(0, 2),
  qk.habits(),
  qk.checkins(),
] as const;

export function useRealtimeSync(): void {
  const queryClient = useQueryClient();
  const { status } = useAppSession();
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.workspace.id;
  // Undo on "Done N min early" opens the task again; the handler below lives
  // in a long-lived effect, so it reads the mutation through a ref.
  const updateTask = useUpdateTask();
  const reopenRef = useRef<(taskId: string) => Promise<unknown>>(
    async () => undefined
  );
  reopenRef.current = (taskId) =>
    updateTask.mutateAsync({ id: taskId, patch: { done: false } });

  useEffect(() => {
    if (status !== "authenticated" || !workspaceId) return;

    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelayMs = INITIAL_REALTIME_RECONNECT_DELAY_MS;
    let stopped = false;

    const refreshCalendar = () => {
      void queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["calendar-feeds"] });
      void useCalendarStore.getState().refreshEvents();
      void useCalendarStore.getState().refreshFeeds();
    };

    const refreshTasks = () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      // The v3 screens read these keys (task dialog, lists, habits).
      for (const key of REALTIME_TASK_QUERY_KEYS) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      void useTaskStore.getState().fetchTasks();
    };

    const refreshDocs = () => {
      void queryClient.invalidateQueries({ queryKey: qk.docs() });
    };

    // A Focus session reached its planned end (the worker also sent a push).
    // Every open device refreshes its Focus UI; the notice is silent and only
    // shown while the "Focus ended" setting is on.
    const onFocusEnded = (event: Event) => {
      const data = parseFocusEnded((event as MessageEvent<string>).data);
      void queryClient.invalidateQueries({ queryKey: qk.focusSession() });
      // Ended because its task was marked done: the timer goes on every
      // device, and the saved minutes changed the plan (Home's time left).
      if (data.status === "early" || data.status === "done") {
        refreshTasks();
        if (data.status === "early") {
          announceEarlyFinish(data, (id) => reopenRef.current(id));
        }
      }
      if (data.status === "notify") {
        notify.success("Focus done", {
          description: data.message,
          dedupeKey: `focus-ended-${data.sessionId ?? "session"}`,
        });
      }
    };

    // Always easy start changed a task or a day: one line with Undo, which
    // runs the logged action's inverse and refreshes. In "suggest" mode the
    // line is a proposal with Apply, which runs the same task.simplify.
    const onEasyStart = (event: Event) => {
      refreshTasks();
      const ev = parseEasyStart((event as MessageEvent<string>).data);
      // The row says Undo for a few minutes; a proposal changes the pending list.
      if (ev.taskId && ev.actionId && !ev.proposalId)
        useRecentSimplified
          .getState()
          .record(ev.taskId, ev.actionId, Date.now());
      void loadProposals();
      announceEasyStart(ev, {
        undo: async (actionId) => {
          await sendJson(`/api/agent/actions/${actionId}/undo`, "POST");
          refreshTasks();
        },
        apply: async (proposalId) => {
          await sendJson(`/api/easy-start/proposals/${proposalId}`, "POST", {
            action: "apply",
          });
          refreshTasks();
        },
      });
    };

    // The idea sweep moved tasks to Ideas: one summed line with Undo, which
    // reverses the whole run, then the lists refresh.
    const onIdeaCards = (event: Event) => {
      refreshTasks();
      announceIdeaCards(parseIdeaCards((event as MessageEvent<string>).data), {
        undo: async (runId) => {
          await sendJson(`/api/agent/runs/${runId}/undo`, "POST");
          refreshTasks();
        },
      });
    };

    // The rows of Always easy start read their proposals and Undo from a store.
    useRecentSimplified.setState({
      refresh: async () => {
        refreshTasks();
        await loadProposals();
      },
    });
    void loadProposals();

    const connect = () => {
      if (stopped) return;
      eventSource = new EventSource(
        `/api/stream?workspaceId=${encodeURIComponent(workspaceId)}`
      );
      eventSource.addEventListener("calendar-updated", refreshCalendar);
      eventSource.addEventListener("tasks-updated", refreshTasks);
      eventSource.addEventListener("docs-updated", refreshDocs);
      eventSource.addEventListener("focus-ended", onFocusEnded);
      eventSource.addEventListener("easy-start", onEasyStart);
      eventSource.addEventListener("idea-cards", onIdeaCards);
      eventSource.onopen = () => {
        reconnectDelayMs = INITIAL_REALTIME_RECONNECT_DELAY_MS;
      };
      eventSource.onerror = () => {
        eventSource?.close();
        eventSource = null;
        if (!stopped && !reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, reconnectDelayMs);
          reconnectDelayMs = nextRealtimeReconnectDelay(reconnectDelayMs);
        }
      };
    };

    try {
      connect();
    } catch (error) {
      void logger.warn(
        "Could not connect to realtime updates",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
    }

    return () => {
      stopped = true;
      eventSource?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [queryClient, status, workspaceId]);
}
