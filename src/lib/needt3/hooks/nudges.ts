"use client";

/* PROACTIVE NUDGES (v3) — what the nudge job (src/worker, ProactiveNudge)
 * noticed, and the one thing it can do about it.
 *
 * Two readers of `/api/notifications`: the corner's tip takes what has not
 * been delivered yet (one delivery, spoken once), the bell lists the latest
 * ones read-only (`?peek=1`). "Fill it" is the real scheduler: the same
 * preview → apply → undo the AI chat's dry-run uses
 * (`/api/tasks/reschedule-preview`), so its Undo puts back exactly what moved.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { logger } from "@/lib/logger";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { ApiError, fetchJson, sendJson } from "./core";

const LOG_SOURCE = "v3-nudges";
const POLL_MS = 60_000;

export type NudgeType =
  | "OVERDUE_TASK"
  | "OVERBOOKED_DAY"
  | "MISSED_FOCUS"
  | "DEADLINE_UNREACHABLE"
  | "FREE_TIME";

/** A `ProactiveNudge` row as `/api/notifications` returns it. */
export interface ApiNudge {
  id: string;
  taskId: string | null;
  type: NudgeType;
  title: string;
  body: string;
  deepLink: string;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

/** The bell's feed: the latest nudges, newest first, nothing marked. */
export function useNudgeFeed() {
  return useQuery({
    queryKey: qk.nudges(),
    queryFn: async () =>
      (
        await fetchJson<{ notifications: ApiNudge[] }>(
          "/api/notifications?peek=1"
        )
      ).notifications,
    refetchInterval: POLL_MS,
    staleTime: 30_000,
  });
}

/** Mark one nudge (its id) or every unread one ("all") read. */
export function useMarkNudgesRead() {
  const qc = useQueryClient();
  return useCallback(
    async (target: string | "all") => {
      try {
        await sendJson(
          "/api/notifications",
          "PATCH",
          target === "all" ? { all: true } : { id: target }
        );
        await qc.invalidateQueries({ queryKey: qk.nudges() });
      } catch (error) {
        logger.warn(
          "Could not mark nudges read",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
      }
    },
    [qc]
  );
}

/**
 * Nudges that have not been spoken yet, oldest first. Polls while the tab is
 * visible; a nudge already taken in is not offered twice.
 */
export function useIncomingNudges(enabled: boolean) {
  const [queue, setQueue] = useState<ApiNudge[]>([]);
  const seen = useRef(new Set<string>());
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const { notifications } = await fetchJson<{
          notifications: ApiNudge[];
        }>("/api/notifications", { cache: "no-store" });
        if (!live) return;
        const fresh = notifications.filter((n) => !seen.current.has(n.id));
        if (!fresh.length) return;
        fresh.forEach((n) => seen.current.add(n.id));
        setQueue((q) => q.concat(fresh));
        void qc.invalidateQueries({ queryKey: qk.nudges() });
      } catch {
        // Nudges are additive; nothing else depends on them.
      }
    };
    void poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [enabled, qc]);

  const drop = useCallback(
    (id: string) => setQueue((q) => q.filter((n) => n.id !== id)),
    []
  );
  return { queue, drop };
}

interface PreviewReply {
  previewToken: string;
  changes: { taskId: string }[];
}
interface ApplyReply {
  undoToken: string;
  changes: { taskId: string }[];
}

/**
 * "Fill it": ask the scheduler where the tasks with no time would go, place
 * them, and say so with an Undo that restores the schedule as it was. Nothing
 * to place is said plainly instead of pretending.
 */
export function useFillFreeTime() {
  const qc = useQueryClient();
  return useCallback(async () => {
    const refresh = () => qc.invalidateQueries({ queryKey: qk.all() });
    const undo = async (token: string) => {
      try {
        await sendJson("/api/tasks/reschedule-preview", "POST", {
          action: "undo",
          token,
        });
        await refresh();
        notify.success("Put back");
      } catch (error) {
        const stale = error instanceof ApiError && error.status === 409;
        notify.warning(stale ? "Cannot undo that now" : "Could not undo", {
          description: stale
            ? "The schedule changed since. Move the tasks by hand."
            : undefined,
        });
      }
    };
    try {
      const preview = await sendJson<PreviewReply>(
        "/api/tasks/reschedule-preview",
        "POST",
        { action: "preview" }
      );
      if (!preview.changes.length) {
        notify.info("Nothing to place", {
          description: "Everything that can have a time already does.",
        });
        return;
      }
      const applied = await sendJson<ApplyReply>(
        "/api/tasks/reschedule-preview",
        "POST",
        { action: "apply", token: preview.previewToken }
      );
      await refresh();
      const n = applied.changes.length;
      notify.success(`Placed ${n} ${n === 1 ? "task" : "tasks"}`, {
        description: "Into your free time, by the plan.",
        duration: 12_000,
        action: { label: "Undo", onClick: () => void undo(applied.undoToken) },
      });
    } catch (error) {
      const stale = error instanceof ApiError && error.status === 409;
      logger.warn(
        "Fill free time failed",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
      if (stale) {
        notify.warning("The schedule changed", {
          description: "Press Fill it again.",
        });
      } else {
        notify.error("Could not fill your free time");
      }
    }
  }, [qc]);
}
