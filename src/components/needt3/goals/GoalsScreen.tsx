"use client";

import { useState } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useIsPro } from "@/components/needt3/paywall/Pro";
import { openPaywall } from "@/components/needt3/paywall/store";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import type { GoalView } from "@/lib/goals";
import {
  type GoalDraft,
  goalRequests,
  useGoal,
  useGoalDetails,
  useGoalWrite,
  useGoals,
} from "@/lib/needt3/hooks/goals";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { useTasks } from "@/lib/needt3/hooks/tasks";

import { nextStep } from "../habits/cards/model";
import { useSpread } from "../home/useSpread";
import { EMPTY_GOAL_FORM, type GoalFormValues, GoalsView } from "./GoalsView";
import { goalPlan } from "./standing";

function numberOrUndefined(value: string) {
  const trimmed = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Goal cards read at most this many goals' tasks (one request each). */
const CARD_DETAILS_MAX = 24;

/**
 * What the goal cards need beyond the goals: each active goal's next step
 * (read from its linked tasks), its project's colour, and today. Nothing is
 * read while the cards are off.
 */
function useGoalCards(on: boolean, goals: readonly GoalView[] | undefined) {
  const tz = useTimeZone();
  const projects = useProjects();
  const taskList = useTasks();
  const ids = on
    ? (goals ?? [])
        .filter((g) => g.status === "active")
        .slice(0, CARD_DETAILS_MAX)
        .map((g) => g.id)
    : [];
  const details = useGoalDetails(ids);
  if (!on || !goals) return undefined;
  const today = formatInTimeZone(newDate(), tz, "yyyy-MM-dd");
  const byId = new Map((taskList.data ?? []).map((t) => [t.id, t] as const));
  const nextSteps: Record<string, { id: string; title: string } | null> = {};
  const stepDays: Record<string, string | null> = {};
  const planned: Record<string, boolean> = {};
  ids.forEach((id, i) => {
    const data = details[i]?.data;
    if (!data) return;
    const step = nextStep(data.tasks);
    nextSteps[id] = step;
    if (!taskList.data) return;
    // due or scheduled, the day the rest of the app draws the task on
    const plan = goalPlan(data.tasks, step, byId, today);
    if (step) stepDays[step.id] = plan.stepDay;
    planned[id] = plan.planned;
  });
  const color = new Map(
    (projects.data ?? []).map((p) => [p.id, p.color] as const)
  );
  const hues: Record<string, string> = {};
  for (const g of goals) {
    const hue = g.projectIds.map((id) => color.get(id)).find(Boolean);
    if (hue) hues[g.id] = hue;
  }
  return { nextSteps, hues, today, stepDays, planned };
}

/** The sheet's text fields as a `goal.create` body. */
export function draftFromForm(form: GoalFormValues): GoalDraft {
  const target = numberOrUndefined(form.targetValue);
  const current = numberOrUndefined(form.currentValue);
  return {
    title: form.title.trim(),
    ...(form.description.trim()
      ? { description: form.description.trim() }
      : {}),
    ...(form.deadline ? { deadline: form.deadline } : {}),
    ...(form.area ? { area: form.area } : {}),
    ...(form.parentId ? { parentId: form.parentId } : {}),
    ...(target !== undefined ? { targetValue: target } : {}),
    ...(target !== undefined ? { currentValue: current ?? 0 } : {}),
    ...(target !== undefined && form.unit.trim()
      ? { unit: form.unit.trim() }
      : {}),
  };
}

/**
 * Goals (`/goals`): the list with progress, one goal open beside it, and the
 * new-goal sheet. `?goal=<id>` opens one; `&checkin=1` (the weekly nudge's
 * link) puts the caret in its check-in. `cards` is the `habits_cards_v1`
 * flag (read on the server by the page): goals draw as cards.
 */
export function GoalsScreen({ cards = false }: { cards?: boolean }) {
  const pro = useIsPro();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("goal");
  const checkInOpen = params.get("checkin") === "1";
  const goals = useGoals();
  const detail = useGoal(selectedId);
  const tasks = useTasks();
  const [form, setForm] = useState<GoalFormValues | null>(null);
  const cardData = useGoalCards(cards, goals.data);
  // Schedule on a card = Spread for that one task: the first day with room
  const spreader = useSpread();

  const select = (id: string | null) =>
    router.replace(
      id ? `${pathname}?goal=${encodeURIComponent(id)}` : pathname,
      {
        scroll: false,
      }
    );

  const create = useGoalWrite(
    goalRequests.create,
    (d) => `Goal “${d.title}” added`
  );
  const update = useGoalWrite(goalRequests.update, (v) =>
    v.status === "achieved"
      ? "Goal achieved"
      : v.status === "dropped"
        ? "Goal let go"
        : "Goal saved"
  );
  const archive = useGoalWrite(goalRequests.archive, () => "Goal archived");
  const checkIn = useGoalWrite(goalRequests.checkIn, () => "Check-in saved");
  const addTask = useGoalWrite(
    goalRequests.addTask,
    (v) => `Added “${v.title}”`
  );
  const linkTask = useGoalWrite(goalRequests.linkTask, () => "Task linked");
  const setTask = useGoalWrite(goalRequests.setTask, () => null);

  const linked = new Set((detail.data?.tasks ?? []).map((t) => t.id));
  const linkable = (tasks.data ?? [])
    .filter((t) => !t.done && !linked.has(t.id))
    .slice(0, 200)
    .map((t) => ({ id: t.id, title: t.title }));

  return (
    <GoalsView
      goals={goals.data}
      loading={goals.isLoading}
      pro={pro}
      selectedId={selectedId}
      detail={selectedId ? detail.data : undefined}
      linkable={linkable}
      checkInOpen={checkInOpen}
      form={form}
      saving={create.isPending}
      onSelect={select}
      onNew={() => setForm({ ...EMPTY_GOAL_FORM })}
      onUpgrade={() => openPaywall("Goals")}
      onFormChange={setForm}
      onFormClose={() => setForm(null)}
      onFormSave={() => {
        if (!form) return;
        void create
          .mutateAsync(draftFromForm(form))
          .then((answer) => {
            setForm(null);
            const made = (answer.result as { goal?: { id: string } }).goal;
            if (made) select(made.id);
          })
          .catch(() => undefined);
      }}
      onCheckIn={(input) => {
        if (selectedId) checkIn.mutate({ goalId: selectedId, ...input });
      }}
      onStatus={(status) => {
        if (selectedId) update.mutate({ goalId: selectedId, status });
      }}
      onArchive={() => {
        if (!selectedId) return;
        archive.mutate({ goalId: selectedId });
        select(null);
      }}
      onAddTask={(title) => {
        if (selectedId) addTask.mutate({ goalId: selectedId, title });
      }}
      onLinkTask={(taskId) => {
        if (selectedId) linkTask.mutate({ goalId: selectedId, taskId });
      }}
      cards={cardData}
      scheduling={spreader.busy}
      onSchedule={(taskId) => void spreader.spread([taskId])}
      onToggleTask={(task) => {
        if (!selectedId) return;
        setTask.mutate({
          goalId: selectedId,
          taskId: task.id,
          done: task.status !== "completed",
        });
      }}
    />
  );
}
