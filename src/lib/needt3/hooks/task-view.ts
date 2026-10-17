"use client";

import { useCallback, useMemo } from "react";

import {
  TASK_VIEW_PREF,
  type TaskViewSettings,
  taskViewOf,
} from "@/lib/needt3/task-view";

import { useSetPref, useSettings } from "./settings";

/**
 * The person's task view: how every task list is drawn. Stored in the user
 * settings (`prefs.taskView`), so it is one setting across Home, Tasks,
 * project pages, the Calendar and the phone, and readable and writable by
 * anything that speaks `/api/user-settings`.
 */
export function useTaskView(): TaskViewSettings {
  const prefs = useSettings().data?.prefs;
  const stored = prefs?.[TASK_VIEW_PREF];
  return useMemo(() => taskViewOf({ [TASK_VIEW_PREF]: stored }), [stored]);
}

/** Change some of it; the rest is kept. The new view shows at once. */
export function useSetTaskView() {
  const view = useTaskView();
  const setPref = useSetPref();
  return useCallback(
    (patch: Partial<TaskViewSettings>) =>
      setPref(TASK_VIEW_PREF, { ...view, ...patch }).catch(() => null),
    [view, setPref]
  );
}
