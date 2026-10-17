"use client";

import { useCallback, useContext, useSyncExternalStore } from "react";

import { SessionContext } from "next-auth/react";

/**
 * Which tasks have their steps unfolded. A per-person, per-browser
 * convenience (localStorage, keyed by user), not a synced setting; when
 * storage is blocked it lasts for the visit.
 */
const PREFIX = "needt.stepsOpen";
const listeners = new Set<() => void>();
const memory = new Map<string, Set<string>>();

const keyFor = (user: string | undefined) => `${PREFIX}.${user ?? "anon"}`;

function load(key: string): Set<string> {
  const hit = memory.get(key);
  if (hit) return hit;
  let ids: string[] = [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed))
      ids = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    // blocked or malformed: start empty
  }
  const set = new Set(ids);
  memory.set(key, set);
  return set;
}

function save(key: string, set: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // private mode: the choice lasts for this visit
  }
}

/** Test seam: forget what was read in memory. */
export function resetStepsOpen() {
  memory.clear();
  listeners.forEach((l) => l());
}

export function useStepsOpen(
  taskId: string
): [boolean, (open: boolean) => void] {
  const user = useContext(SessionContext)?.data?.user?.id;
  const key = keyFor(user);
  const open = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => load(key).has(taskId),
    () => false
  );
  const set = useCallback(
    (next: boolean) => {
      const ids = new Set(load(key));
      if (next) ids.add(taskId);
      else ids.delete(taskId);
      memory.set(key, ids);
      save(key, ids);
      listeners.forEach((l) => l());
    },
    [key, taskId]
  );
  return [open, set];
}
