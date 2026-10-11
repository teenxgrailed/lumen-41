"use client";

import { useCallback, useRef, useState } from "react";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { liveHabits } from "@/lib/needt3/derive";
import {
  useArchiveHabit,
  useCheckins,
  useCreateHabit,
  useHabits,
  useToggleHabitToday,
  useUpdateHabit,
} from "@/lib/needt3/hooks/habits";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import type { V3Habit } from "@/lib/needt3/map";

import { capHabits } from "../../habits/derive";
import { snack } from "../overlays/snack";
import { usePhoneOverlays } from "../overlays/store";
import {
  BLANK_HABIT_FORM,
  HABITS_PAYWALL_FEATURE,
  type HabitForm,
  checkHabitForm,
  formFields,
  formFromHabit,
  habitQuota,
  keptToday,
} from "./model";

/**
 * Everything the phone Habits screen holds, called ONCE by the route
 * component above the phone / desktop face switch (round-2 rule: two faces,
 * one state). The new / edit sheet, what has been typed into it, the "show
 * all" fold and the in-flight write live here, so crossing 700 px while the
 * sheet is open keeps the draft, and a save that is running can neither be
 * repeated by the other face nor lost with the face that started it. The
 * data itself is TanStack Query, shared by key with the desktop face.
 *
 * Nothing else is stateful: the rows, the streaks and the 14-day dots are
 * derived from the checkins at render time, and the time-left card reads its
 * own clock.
 */
export function usePhoneHabits() {
  const tz = useTimeZone();
  const today = formatInTimeZone(newDate(), tz, "yyyy-MM-dd");
  const habits = useHabits();
  const checkinsQuery = useCheckins();
  const projectsQuery = useProjects();
  const plan = usePlan();
  const toggleToday = useToggleHabitToday();
  const createHabit = useCreateHabit();
  const updateHabit = useUpdateHabit();
  const archiveHabit = useArchiveHabit();
  const openPaywall = usePhoneOverlays((s) => s.openPaywall);

  const [form, setForm] = useState<HabitForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [all, setAll] = useState(false);
  /* A tap on Create twice must write once; the ref closes the gap before the
     state re-renders. */
  const busy = useRef(false);

  const list = liveHabits(habits.data ?? []);
  const checkins = checkinsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const quota = habitQuota(plan.data?.kind, list.length);
  const kept = keptToday(list, checkins, today);
  const { over, shown } = capHabits(list, all);

  const tick = useCallback(
    (h: V3Habit, done: boolean) => toggleToday.mutate({ id: h.id, done }),
    [toggleToday]
  );

  /** A new habit past the Free allowance goes to the paywall, not the sheet. */
  const blocked = () => {
    if (!quota.atLimit) return false;
    openPaywall(HABITS_PAYWALL_FEATURE);
    return true;
  };

  const openNew = () => {
    if (blocked()) return;
    setForm({ ...BLANK_HABIT_FORM });
  };
  const openEdit = (h: V3Habit) => setForm(formFromHabit(h));
  const closeForm = () => setForm(null);
  const patchForm = (p: Partial<HabitForm>) =>
    setForm((f) => (f ? { ...f, ...p } : f));

  /** Create from a bare name (the pull-down's Enter): the same gate. */
  const create = async (title: string) => {
    const name = title.trim();
    if (!name || busy.current || blocked()) return false;
    busy.current = true;
    setSaving(true);
    try {
      const { undo } = await createHabit.mutateAsync({
        draft: { title: name },
      });
      snack(`Habit “${name}” added`, undo);
      return true;
    } catch {
      return false; // the hook told the person and put the cache back
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  /** Save the sheet. It closes when the write lands; on an error it stays. */
  const save = async () => {
    const f = form;
    if (!f || busy.current || !checkHabitForm(f).ok) return;
    const fields = formFields(f);
    if (!f.editId && blocked()) return;
    busy.current = true;
    setSaving(true);
    try {
      if (f.editId) {
        const { undo } = await updateHabit.mutateAsync({
          id: f.editId,
          patch: fields,
        });
        snack("Habit updated", undo);
      } else {
        const { undo } = await createHabit.mutateAsync({ draft: fields });
        snack(`Habit “${fields.title}” added`, undo);
      }
      setForm(null);
    } catch {
      /* the hook told the person; the sheet and what they typed stay */
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const archive = async (h: V3Habit) => {
    try {
      await archiveHabit.mutateAsync({ id: h.id });
      //todo: Undo needs an un-archive write on /api/habits/[id] (the
      // prototype's snack undoes with archivedAt = null).
      snack(`Archived “${h.title}”`);
    } catch {
      /* the hook told the person */
    }
  };

  return {
    tz,
    today,
    habits,
    checkinsQuery,
    list,
    shown,
    over,
    all,
    setAll,
    checkins,
    projects,
    quota,
    kept,
    form,
    saving,
    tick,
    openNew,
    openEdit,
    closeForm,
    patchForm,
    save,
    create,
    archive,
    openUpgrade: () => openPaywall(HABITS_PAYWALL_FEATURE),
  };
}

export type PhoneHabitsController = ReturnType<typeof usePhoneHabits>;
