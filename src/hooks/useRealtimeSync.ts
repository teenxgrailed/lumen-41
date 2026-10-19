"use client";

import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { useAppSession } from "@/components/providers/app-session-context";

import { logger } from "@/lib/logger";
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
      let data: { sessionId?: string; status?: string; message?: string } = {};
      try {
        data = JSON.parse((event as MessageEvent<string>).data);
      } catch {
        // A malformed event still refreshes the session below.
      }
      void queryClient.invalidateQueries({ queryKey: qk.focusSession() });
      if (data.status === "notify") {
        notify.success("Focus done", {
          description: data.message,
          dedupeKey: `focus-ended-${data.sessionId ?? "session"}`,
        });
      }
    };

    const connect = () => {
      if (stopped) return;
      eventSource = new EventSource(
        `/api/stream?workspaceId=${encodeURIComponent(workspaceId)}`
      );
      eventSource.addEventListener("calendar-updated", refreshCalendar);
      eventSource.addEventListener("tasks-updated", refreshTasks);
      eventSource.addEventListener("docs-updated", refreshDocs);
      eventSource.addEventListener("focus-ended", onFocusEnded);
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
