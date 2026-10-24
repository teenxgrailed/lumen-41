"use client";

import { useCallback, useMemo } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { addMinutes, formatInTimeZone, newDate } from "@/lib/date-utils";
import { qk } from "@/lib/needt3/query-keys";
import { NEEDT_SCHEDULE_CHANGED_EVENT } from "@/lib/needt-events";
import { notify } from "@/lib/notifications";
import {
  type PersonalBlockLike,
  type PersonalPreset,
  expandPersonalBlocks,
} from "@/lib/personal-time";
import { type DayBand, dayBands, quickStart } from "@/lib/personal-time-days";
import type { PersonalPatch } from "@/lib/personal-time-edit";

import { ApiError, fetchJson, sendJson } from "./core";
import { useTimeZone } from "./settings";

/**
 * PERSONAL TIME on the client. One read (`GET /api/personal-blocks`) holds the
 * block definitions; each screen expands them for the days it shows, so
 * scrolling the calendar never refetches. Every write is an op on the server
 * and comes back with an action id, which is what Undo runs.
 */

export interface ApiPersonalBlock {
  id: string;
  kind: string;
  title: string;
  emoji: string | null;
  color: string | null;
  start: string;
  end: string;
  rrule: string | null;
  sourceEventId: string | null;
  isDefault: boolean;
  updatedAt: string;
}

interface ListResponse {
  blocks: ApiPersonalBlock[];
}

interface WriteResponse {
  result: { block: ApiPersonalBlock | null; already?: boolean };
  actionId: string | null;
  undoable: boolean;
}

/** The person's personal time blocks. */
export function usePersonalBlocks() {
  return useQuery({
    queryKey: qk.personal(),
    queryFn: () => fetchJson<ListResponse>("/api/personal-blocks"),
    staleTime: 60_000,
  });
}

const WINDOW_BEFORE_DAYS = 60;
const WINDOW_AFTER_DAYS = 240;

function asLike(block: ApiPersonalBlock): PersonalBlockLike {
  return {
    id: block.id,
    kind: block.kind,
    title: block.title,
    emoji: block.emoji,
    color: block.color,
    start: newDate(block.start),
    end: newDate(block.end),
    rrule: block.rrule,
    sourceEventId: block.sourceEventId,
  };
}

/**
 * Every personal time band, by the person's day, for about eight months
 * around today. The calendar, Home and the phone all read this one map.
 */
export function usePersonalBands(): ReadonlyMap<string, readonly DayBand[]> {
  const tz = useTimeZone();
  const blocks = usePersonalBlocks().data?.blocks;
  return useMemo(() => {
    if (!blocks?.length) return new Map<string, DayBand[]>();
    const now = newDate();
    const from = newDate(now.getTime() - WINDOW_BEFORE_DAYS * 86_400_000);
    const to = newDate(now.getTime() + WINDOW_AFTER_DAYS * 86_400_000);
    return dayBands(
      expandPersonalBlocks(blocks.map(asLike), { from, to, timeZone: tz }),
      tz
    );
  }, [blocks, tz]);
}

/** One day's personal time, in order. The hook Home's day reads. */
export function usePersonalDay(date: string): readonly DayBand[] {
  return usePersonalBands().get(date) ?? [];
}

function useRefresh() {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: qk.personal() });
    void qc.invalidateQueries({ queryKey: qk.tasks() });
    window.dispatchEvent(new CustomEvent(NEEDT_SCHEDULE_CHANGED_EVENT));
  }, [qc]);
}

function useUndoNotice() {
  const refresh = useRefresh();
  return useCallback(
    (message: string, run: WriteResponse) => {
      const actionId = run.actionId;
      notify.success(message, {
        ...(actionId && run.undoable
          ? {
              action: {
                label: "Undo",
                onClick: () =>
                  void sendJson(`/api/agent/actions/${actionId}/undo`, "POST")
                    .then(refresh)
                    .catch((error: unknown) =>
                      notify.error(
                        error instanceof ApiError && error.status === 409
                          ? "Could not undo: it changed since."
                          : "Could not undo."
                      )
                    ),
              },
            }
          : {}),
      });
    },
    [refresh]
  );
}

export interface PersonalDraft {
  kind?: string;
  title?: string;
  emoji?: string;
  /** ISO instants. */
  start: string;
  end?: string;
  minutes?: number;
  rrule?: string;
}

function failNotice(error: unknown, fallback: string) {
  notify.error(error instanceof ApiError ? error.message : fallback);
}

/** Create a block. Resolves to the new block, or null when it could not be kept. */
export function useCreatePersonal() {
  const refresh = useRefresh();
  const notice = useUndoNotice();
  return useCallback(
    async (draft: PersonalDraft, said?: string) => {
      try {
        const run = await sendJson<WriteResponse>(
          "/api/personal-blocks",
          "POST",
          draft
        );
        refresh();
        const block = run.result.block;
        notice(said ?? `Kept time for ${block?.title ?? "you"}`, run);
        return block;
      } catch (error) {
        failNotice(error, "Could not keep that time.");
        return null;
      }
    },
    [refresh, notice]
  );
}

/** One tap: the preset, from the next half hour (or `at`, a "YYYY-MM-DDTHH:mm" in the person's zone is not needed: pass an ISO instant). */
export function useQuickPersonal() {
  const tz = useTimeZone();
  const create = useCreatePersonal();
  return useCallback(
    (preset: PersonalPreset, startIso?: string) => {
      const start = startIso
        ? newDate(startIso)
        : quickStart(newDate(), tz, preset.minutes, preset.at);
      const end = addMinutes(start, preset.minutes);
      const when = `${formatInTimeZone(start, tz, "HH:mm")}–${formatInTimeZone(end, tz, "HH:mm")}`;
      return create(
        {
          kind: preset.kind,
          start: start.toISOString(),
          minutes: preset.minutes,
        },
        `${preset.emoji} ${preset.title} · ${when}`
      );
    },
    [tz, create]
  );
}

/**
 * Change a block (`PATCH /api/personal-blocks/:id`, the `personal.update` op the
 * agent also runs). The patch is only what changed; a repeating block changes
 * as a whole, every repeat together. Resolves to whether it was saved.
 */
export function useUpdatePersonal() {
  const refresh = useRefresh();
  const notice = useUndoNotice();
  return useCallback(
    async (block: { id: string; title: string }, patch: PersonalPatch) => {
      if (!Object.keys(patch).length) return true;
      try {
        const run = await sendJson<WriteResponse>(
          `/api/personal-blocks/${block.id}`,
          "PATCH",
          patch
        );
        refresh();
        notice(`Saved ${run.result.block?.title ?? block.title}`, run);
        return true;
      } catch (error) {
        failNotice(error, "Could not save that.");
        return false;
      }
    },
    [refresh, notice]
  );
}

export function useDeletePersonal() {
  const refresh = useRefresh();
  const notice = useUndoNotice();
  return useCallback(
    async (block: { id: string; title: string }) => {
      try {
        const run = await sendJson<WriteResponse>(
          `/api/personal-blocks/${block.id}`,
          "DELETE"
        );
        refresh();
        notice(`Removed ${block.title}`, run);
        return true;
      } catch (error) {
        failNotice(error, "Could not remove it.");
        return false;
      }
    },
    [refresh, notice]
  );
}

/** Mark a calendar event (synced or local) as personal time. */
export function useMarkEventPersonal() {
  const refresh = useRefresh();
  const notice = useUndoNotice();
  return useCallback(
    async (event: { id: string; title: string }, kind?: string) => {
      try {
        const run = await sendJson<WriteResponse>(
          "/api/personal-blocks/mark-event",
          "POST",
          { eventId: event.id, ...(kind ? { kind } : {}) }
        );
        refresh();
        notice(
          run.result.already
            ? `${event.title} is already personal time`
            : `${event.title} is personal time now. No task goes over it`,
          run
        );
        return true;
      } catch (error) {
        failNotice(error, "Could not mark it as personal time.");
        return false;
      }
    },
    [refresh, notice]
  );
}

export interface PersonalDefault {
  kind: string;
  enabled: boolean;
  at?: string;
  minutes?: number;
  days?: number[];
}

/** Settings → Your day: the repeating default of one kind. */
export function useSetPersonalDefault() {
  const refresh = useRefresh();
  return useCallback(
    async (patch: PersonalDefault) => {
      try {
        await sendJson<WriteResponse>(
          "/api/personal-blocks/defaults",
          "POST",
          patch
        );
        refresh();
        return true;
      } catch (error) {
        failNotice(error, "Could not save that.");
        return false;
      }
    },
    [refresh]
  );
}

/** The repeating defaults the person has set, by kind. */
export function usePersonalDefaults() {
  const blocks = usePersonalBlocks().data?.blocks;
  return useMemo(
    () =>
      new Map(
        (blocks ?? []).filter((b) => b.isDefault).map((b) => [b.kind, b])
      ),
    [blocks]
  );
}
