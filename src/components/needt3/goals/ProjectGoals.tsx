"use client";

import { useGoals } from "@/lib/needt3/hooks/goals";

import { ProjectGoalsView } from "./GoalsView";

/** The goals a project is linked to, with progress, under its header. */
export function ProjectGoals({ projectId }: { projectId: string }) {
  const goals = useGoals({ projectId });
  return goals.data ? <ProjectGoalsView goals={goals.data} /> : null;
}
