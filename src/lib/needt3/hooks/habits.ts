"use client";

import { useQuery } from "@tanstack/react-query";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import {
  type Checkin,
  checkinsFromStrip,
  setCheckin,
} from "@/lib/needt3/derive";
import {
  type ApiHabit,
  type V3Habit,
  habitFromApi,
  habitPatchToApi,
} from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";

import {
  dropListItem,
  fetchJson,
  findListItem,
  patchListItem,
  previousFields,
  sendJson,
  useUndoableMutation,
} from "./core";
import { useTimeZone } from "./settings";

const HABITS = qk.habits();
const CHECKINS = qk.checkins();

export function useHabits() {
  return useQuery({
    queryKey: HABITS,
    queryFn: async () =>
      (await fetchJson<{ habits: ApiHabit[] }>("/api/habits")).habits.map(
        habitFromApi
      ),
  });
}

/**
 * The last fourteen days of checkins, as HabitCheckin rows. Read from
 * `/api/needt/today`, which returns each habit's fourteen-day strip ending on
 * the person's today.
 */
export function useCheckins() {
  const tz = useTimeZone();
  return useQuery({
    queryKey: CHECKINS,
    queryFn: async () => {
      const today = await fetchJson<{
        now: string;
        habits: { id: string; done: (0 | 1)[] }[];
      }>("/api/needt/today");
      const end = formatInTimeZone(today.now, tz, "yyyy-MM-dd");
      //todo: streaks past fourteen days need a longer history route.
      return today.habits.flatMap((h) => checkinsFromStrip(h.id, h.done, end));
    },
  });
}

type HabitPatch = Partial<Omit<V3Habit, "id" | "archivedAt">>;

export function useUpdateHabit() {
  return useUndoableMutation<{ id: string; patch: HabitPatch }, V3Habit>({
    scope: HABITS,
    label: "update the habit",
    inverse: (qc, { id, patch }) => {
      const cur = findListItem<V3Habit>(qc, HABITS, id);
      return cur ? { id, patch: previousFields(cur, patch) } : null;
    },
    optimistic: (qc, { id, patch }) =>
      patchListItem<V3Habit>(qc, HABITS, id, (h) => ({ ...h, ...patch })),
    request: async ({ id, patch }) =>
      habitFromApi(
        (
          await sendJson<{ habit: ApiHabit }>(
            `/api/habits/${id}`,
            "PATCH",
            habitPatchToApi(patch)
          )
        ).habit
      ),
  });
}

/**
 * Tick or untick today. `PUT/DELETE /api/habits/[id]/completions/today` is
 * the only write the API has; a past day cannot be ticked yet.
 */
export function useToggleHabitToday() {
  const tz = useTimeZone();
  return useUndoableMutation<{ id: string; done: boolean }, unknown>({
    scope: CHECKINS,
    label: "update the habit",
    inverse: (_qc, { id, done }) => ({ id, done: !done }),
    optimistic: (qc, { id, done }) => {
      const today = formatInTimeZone(newDate(), tz, "yyyy-MM-dd");
      qc.setQueryData<Checkin[]>(CHECKINS, (list) =>
        list ? setCheckin(list, id, today, done) : list
      );
    },
    request: ({ id, done }) =>
      sendJson(`/api/habits/${id}/completions/today`, done ? "PUT" : "DELETE"),
  });
}

/** Create a habit. Undo archives it. */
export function useCreateHabit(opts?: { quiet?: (error: unknown) => boolean }) {
  return useUndoableMutation<
    { draft: HabitPatch & { title: string } } | { archiveId: string },
    V3Habit | null
  >({
    scope: HABITS,
    label: "create the habit",
    quiet: opts?.quiet,
    inverseFromResult: true,
    inverse: (_qc, vars, result) =>
      "draft" in vars && result ? { archiveId: result.id } : null,
    optimistic: (qc, vars) => {
      if ("archiveId" in vars)
        dropListItem<V3Habit>(qc, HABITS, vars.archiveId);
    },
    request: async (vars) => {
      if ("archiveId" in vars) {
        await sendJson(`/api/habits/${vars.archiveId}`, "DELETE");
        return null;
      }
      const perWeek = vars.draft.schedule?.perWeek ?? null;
      return habitFromApi(
        (
          await sendJson<{ habit: ApiHabit }>("/api/habits", "POST", {
            targetOccurrencesPerWeek: perWeek ?? 7,
            estimatedMinutes: 30,
            ...habitPatchToApi(vars.draft),
          })
        ).habit
      );
    },
  });
}

/** Archive a habit (it leaves the list; history is kept). No undo route yet. */
export function useArchiveHabit() {
  return useUndoableMutation<{ id: string }, unknown>({
    scope: HABITS,
    label: "remove the habit",
    //todo: undo needs an un-archive write on /api/habits/[id].
    optimistic: (qc, { id }) => dropListItem<V3Habit>(qc, HABITS, id),
    request: ({ id }) => sendJson(`/api/habits/${id}`, "DELETE"),
  });
}
