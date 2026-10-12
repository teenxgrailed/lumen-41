"use client";

import { useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { liveHabits } from "@/lib/needt3/derive";
import { isUpgradeRequired } from "@/lib/needt3/hooks/core";
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
import { qk } from "@/lib/needt3/query-keys";

import {
  BLANK_HABIT_FORM,
  type HabitForm,
  checkHabitForm,
  formFields,
  formFromHabit,
  habitQuota,
  keptToday,
} from "../phone/habits/model";
import { snack } from "../phone/overlays/snack";
import { capHabits } from "./derive";

export interface HabitsControllerOptions {
  /**
   * A new habit was refused by the Free allowance. The phone opens the
   * paywall sheet; the desktop shows its notice. The route knows which face
   * is drawn, so it passes this (read at the moment of the tap).
   */
  onBlocked: () => void;
  /** The notice after an archive; the faces word it differently. */
  archivedMessage?: (title: string) => string;
}

/**
 * Everything the Habits screen holds, called ONCE by the route component
 * above the phone / desktop face switch and handed to BOTH faces (round-2
 * rule: two faces, one state). The new / edit sheet, what has been typed into it, the "show
 * all" fold and the in-flight write live here, so crossing 700 px while the
 * sheet is open keeps the draft, and a save that is running can neither be
 * repeated by the other face nor lost with the face that started it. The
 * data itself is TanStack Query, shared by key with the desktop face.
 *
 * Nothing else is stateful: the rows, the streaks and the 14-day dots are
 * derived from the checkins at render time, and the time-left card reads its
 * own clock.
 */
export function useHabitsController(opts: HabitsControllerOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const tz = useTimeZone();
  const today = formatInTimeZone(newDate(), tz, "yyyy-MM-dd");
  const habits = useHabits();
  const checkinsQuery = useCheckins();
  const projectsQuery = useProjects();
  const plan = usePlan();
  const toggleToday = useToggleHabitToday();
  /* A plan refusal from the server is answered here (the paywall), so the
     mutation's generic "could not" notice stays quiet for it. */
  const createHabit = useCreateHabit({ quiet: isUpgradeRequired });
  const qc = useQueryClient();
  const updateHabit = useUpdateHabit();
  const archiveHabit = useArchiveHabit();

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

  const tick = (h: V3Habit, done: boolean) =>
    toggleToday.mutate({ id: h.id, done });

  /** A new habit past the Free allowance goes to the paywall, not the sheet. */
  const blocked = () => {
    if (!quota.atLimit) return false;
    optsRef.current.onBlocked();
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

  /**
   * The server said no (403 UPGRADE_REQUIRED): the plan the client held was
   * stale. Refresh it and send the person to the same place a refused tap
   * goes; the sheet and its text stay.
   */
  const refused = (error: unknown) => {
    if (!isUpgradeRequired(error)) return;
    void qc.invalidateQueries({ queryKey: qk.plan() });
    optsRef.current.onBlocked();
  };

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
    } catch (error) {
      refused(error);
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
    } catch (error) {
      /* the hook told the person (or `refused` opened the paywall); the
         sheet and what they typed stay */
      refused(error);
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
      snack(
        (optsRef.current.archivedMessage ?? ((t) => `Archived “${t}”`))(h.title)
      );
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
  };
}

export type HabitsController = ReturnType<typeof useHabitsController>;
