"use client";

/* THE BELL'S FEED (v3) — `GET /api/notifications?feed=1`, read-only, plus the
 * read marks (`POST /api/notifications/read`). The feed is assembled on the
 * server from nudges, agent actions, comments, shares, sync problems, imports,
 * reminders and due tasks; see src/services/notifications/feed.ts.
 */
import { useCallback } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { logger } from "@/lib/logger";
import { qk } from "@/lib/needt3/query-keys";

import { fetchJson, sendJson } from "./core";

const LOG_SOURCE = "v3-notifications";
const POLL_MS = 60_000;

export type FeedGroup = "activity" | "reminders";

export interface FeedItem {
  key: string;
  group: FeedGroup;
  kind:
    | "nudge"
    | "notification"
    | "agent"
    | "comment"
    | "share"
    | "sync"
    | "import"
    | "reminder"
    | "due"
    | "overdue";
  actor: string | null;
  title: string;
  body: string | null;
  at: string;
  link: string;
  unread: boolean;
  /** The task or event behind the row (Done and Tomorrow use it). */
  entity?: { type: "task" | "event" | "reminder"; id: string } | null;
  /** A reminder row's reminder: snooze and edit go to it. */
  reminderId?: string;
}

export interface FeedPage {
  items: FeedItem[];
  nextBefore: string | null;
  unreadCount: number;
}

/** One older page of activity, for "Show earlier". */
export function fetchEarlier(before: string) {
  return fetchJson<FeedPage>(
    `/api/notifications?feed=1&group=activity&before=${encodeURIComponent(before)}`,
    { cache: "no-store" }
  );
}

export function useNotificationFeed(group: FeedGroup, enabled = true) {
  return useQuery({
    queryKey: qk.notifications(group),
    queryFn: () =>
      fetchJson<FeedPage>(`/api/notifications?feed=1&group=${group}`, {
        cache: "no-store",
      }),
    enabled,
    refetchInterval: POLL_MS,
    staleTime: 30_000,
  });
}

/** Mark the given item keys, or everything ("all"), read. */
export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useCallback(
    async (target: string[] | "all") => {
      try {
        await sendJson(
          "/api/notifications/read",
          "POST",
          target === "all" ? { all: true } : { keys: target }
        );
        await qc.invalidateQueries({ queryKey: qk.nudges() });
      } catch (error) {
        logger.warn(
          "Could not mark notifications read",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
      }
    },
    [qc]
  );
}

/** Hide rows until `until` ("Tomorrow"); they come back unread. */
export function useSnoozeNotifications() {
  const qc = useQueryClient();
  return useCallback(
    async (keys: string[], until: Date) => {
      try {
        await sendJson("/api/notifications/snooze", "POST", {
          keys,
          until: until.toISOString(),
        });
        await qc.invalidateQueries({ queryKey: qk.nudges() });
      } catch (error) {
        logger.warn(
          "Could not snooze notifications",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
      }
    },
    [qc]
  );
}
