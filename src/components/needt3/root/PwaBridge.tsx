"use client";

import { useEffect } from "react";

import { useNow } from "@/lib/needt3/hooks/clock";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { useTasks } from "@/lib/needt3/hooks/tasks";
import { dayAt } from "@/lib/needt3/today";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { badgeCount, setBadge } from "./appBadge";

/** What an app-icon shortcut asks for: `/today?launch=new-task`. */
export type LaunchAction = "new-task" | "ask";

export function launchActionOf(search: string): LaunchAction | null {
  const v = new URLSearchParams(search).get("launch");
  return v === "new-task" || v === "ask" ? v : null;
}

/**
 * Two things the installed app does that have no screen: it opens what an
 * app-icon shortcut asked for (New task, Ask Needt), and it keeps the icon's
 * badge at today's open tasks plus the overdue ones.
 */
export function PwaBridge() {
  useEffect(() => {
    const action = launchActionOf(window.location.search);
    if (!action) return;
    const ui = useNeedt3Ui.getState();
    if (action === "ask") ui.setAskOpen(true);
    else ui.setComposerOpen(true);
    // the parameter has done its work: a reload must not reopen the sheet
    const url = new URL(window.location.href);
    url.searchParams.delete("launch");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const tz = useTimeZone();
  const today = dayAt(useNow(), tz);
  const tasks = useTasks().data;
  const count = tasks ? badgeCount(tasks, today) : null;
  useEffect(() => {
    if (count === null) return;
    setBadge(count);
  }, [count]);
  return null;
}
