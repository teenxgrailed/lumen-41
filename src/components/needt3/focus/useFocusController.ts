"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { newDate } from "@/lib/date-utils";
import {
  BREAK_MINUTES,
  type FocusRow,
  type FocusRun,
  type FocusSummary,
  MORE_MINUTES,
  QUICK_MINUTES,
  type Sound,
  clockOf,
  intentionOf,
  isSound,
  lengthFromPref,
  lengthMinutes,
  nextTask,
  openTasks,
  runOf,
  startedLine,
  summaryOf,
  tabTitle,
  taskOf,
} from "@/lib/needt3/focus";
import {
  useFocusActions,
  useFocusSession,
  useFocusStats,
} from "@/lib/needt3/hooks/focus";
import {
  useSetPref,
  useSettings,
  useTimeZone,
} from "@/lib/needt3/hooks/settings";
import { useTasks } from "@/lib/needt3/hooks/tasks";
import type { V3Task } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { readPref } from "../settings/derive";
import { type SetupDraft, useFocusWindow } from "./store";
import { finish as copy } from "./strings";

/** A session this far past its end, found on load, is closed quietly. */
const STALE_MS = 60_000;

/**
 * The running session as the clock sees it: the server's row and a `now`
 * that moves every second while the clock moves. One tick per reader, so the
 * sidebar pill and the window each keep their own and neither waits on the
 * other.
 */
export function useFocusRun() {
  const query = useFocusSession();
  const session = query.data ?? null;
  const [nowMs, setNowMs] = useState(() => newDate().getTime());
  const ticking = !!session && !session.pausedAt;
  const id = session?.id;
  const pausedAt = session?.pausedAt;
  useEffect(() => {
    // `id` and `pausedAt` are not read: a new session or a pause re-reads now.
    void id;
    void pausedAt;
    setNowMs(newDate().getTime());
    if (!ticking) return undefined;
    const t = window.setInterval(() => setNowMs(newDate().getTime()), 1000);
    return () => window.clearInterval(t);
  }, [ticking, id, pausedAt]);
  const run = useMemo(
    () => (session ? runOf(session, nowMs) : null),
    [session, nowMs]
  );
  return { session, run, nowMs, loading: query.isLoading };
}

/**
 * Starts a session from anywhere that is not the window's own setup (Home's
 * Start focus, a task's sheet, the phone's Next up): 25 minutes on the task,
 * the window opens on its clock, and one notice says so. A session that is
 * already running is not replaced; the window just opens on it.
 */
export function useStartFocus() {
  const qc = useQueryClient();
  const actions = useFocusActions();
  const setOpen = useNeedt3Ui((s) => s.setFocusOpen);
  return useCallback(
    async (task: { id: string; title: string }, minutes = QUICK_MINUTES) => {
      if (qc.getQueryData(qk.focusSession())) {
        setOpen(true);
        return null;
      }
      const row = await actions.start({
        taskId: task.id,
        intention: task.title,
        plannedMinutes: minutes,
      });
      if (!row) return null;
      useFocusWindow.getState().reset();
      setOpen(true);
      notify.success(startedLine(minutes, task.title));
      return row;
    },
    [qc, actions, setOpen]
  );
}

export type FocusView = "setup" | "run" | "end";

/**
 * Everything the Focus window keeps that must outlive a face swap, created
 * once by `FocusHost` above the desktop / phone switch and handed to either
 * face: the session (the server's, derived second by second), the form, the
 * End view, the End session confirm, the tab title, and what happens when the
 * clock runs out. A face draws; it owns nothing.
 */
export function useFocusController() {
  const tz = useTimeZone();
  const open = useNeedt3Ui((s) => s.focusOpen);
  const setOpen = useNeedt3Ui((s) => s.setFocusOpen);
  const tasksQuery = useTasks();
  const tasks = tasksQuery.data;
  const settings = useSettings();
  const setPref = useSetPref();
  const actions = useFocusActions();
  const ui = useFocusWindow();
  const { session, run, nowMs } = useFocusRun();

  const view: FocusView = run ? "run" : ui.summary ? "end" : "setup";
  const task = run ? taskOf(tasks, run) : null;
  const stats = useFocusStats(open && view === "end");

  /* ---------- the form ---------- */
  const prefs = settings.data?.prefs;
  const openList = useMemo(() => openTasks(tasks), [tasks]);
  const base: SetupDraft = useMemo(() => {
    const { len, custom } = lengthFromPref(readPref(prefs, "len"));
    const first =
      ui.preset && openList.some((t) => t.id === ui.preset)
        ? ui.preset
        : (openList[0]?.id ?? "");
    return { purpose: "", len, custom, taskId: first };
  }, [prefs, ui.preset, openList]);
  const draft = ui.draft ?? base;
  const setDraft = (p: Partial<SetupDraft>) =>
    useFocusWindow.getState().patch({
      draft: { ...(useFocusWindow.getState().draft ?? base), ...p },
    });
  const rawSound = prefs?.focusAmbient;
  const sound: Sound = isSound(rawSound) ? rawSound : "off";
  const hide = readPref(prefs, "focusHideOthers");
  const setSound = (v: Sound) => void setPref("focusAmbient", v);
  const setHide = (v: boolean) => void setPref("focusHideOthers", v);

  /* ---------- ending ---------- */
  // What the closures below read, as of the latest render.
  const live = useRef({ session, run, tasks, ui, open });
  live.current = { session, run, tasks, ui, open };
  const finishing = useRef<string | null>(null);
  // The session this tab ended itself: its disappearing is not "elsewhere".
  const endedHere = useRef<string | null>(null);

  const finish = useCallback(
    async (how: FocusSummary["how"], quiet = false) => {
      const { session: row, run: r, tasks: list } = live.current;
      if (!row || !r || finishing.current === r.id) return;
      finishing.current = r.id;
      const t = taskOf(list, r);
      const title = r.isBreak ? "Break" : (t?.title ?? r.intention ?? "Focus");
      const summary = summaryOf(
        how === "complete" && r.plannedMinutes != null
          ? { ...r, elapsedSec: r.plannedMinutes * 60 }
          : r,
        title,
        how
      );
      const w = useFocusWindow.getState();
      endedHere.current = r.id;
      // The summary first, so the window already knows what it will show.
      if (!quiet) {
        if (r.isBreak)
          w.patch({
            summary: null,
            note:
              how === "complete"
                ? copy.breaks_over_pick_up_where_you_left_off
                : null,
            preset: w.breakAfter,
            breakAfter: null,
          });
        else w.patch({ summary });
        useNeedt3Ui.getState().setFocusOpen(true);
      }
      const ok = await actions.stop(row, how === "complete");
      finishing.current = null;
      if (!ok) {
        endedHere.current = null;
        useFocusWindow.getState().patch({ summary: null, note: null });
        return;
      }
      useFocusWindow.getState().patch({ confirmEnd: false });
      if (quiet)
        notify.success(
          `Focus session ended · ${summary.minutes} min on “${title}”`
        );
    },
    [actions]
  );

  // The clock ran out (and the session is not paused): it is done. A session
  // found long past its end is closed without bringing the window up.
  const due = !!run?.due;
  const runId = run?.id;
  useEffect(() => {
    if (!due || !live.current.run) return;
    const r = live.current.run;
    const over =
      r.plannedMinutes != null
        ? (r.elapsedSec - r.plannedMinutes * 60) * 1000
        : 0;
    void finish("complete", over > STALE_MS && !live.current.open);
  }, [due, runId, finish]);

  // A session that ended in another tab puts the window away.
  const wasRunning = useRef<string | null>(null);
  useEffect(() => {
    const prev = wasRunning.current;
    wasRunning.current = runId ?? null;
    if (prev && !runId && prev !== endedHere.current) {
      useFocusWindow.getState().patch({ confirmEnd: false });
      if (!live.current.ui.summary) useNeedt3Ui.getState().setFocusOpen(false);
    }
  }, [runId]);

  /* ---------- the tab title ---------- */
  const clock = run ? clockOf(run) : null;
  useEffect(() => {
    document.title = tabTitle(document.title, clock);
  }, [clock]);
  useEffect(
    () => () => {
      document.title = tabTitle(document.title, null);
    },
    []
  );

  /* ---------- the controls ---------- */
  const begin = async () => {
    const d = useFocusWindow.getState().draft ?? base;
    const { minutes, bad } = lengthMinutes(d.len, d.custom);
    if (bad) return;
    const t = openList.find((x) => x.id === d.taskId) ?? null;
    const row = await actions.start({
      taskId: t?.id ?? null,
      intention: intentionOf(d.purpose, t),
      plannedMinutes: minutes,
    });
    if (row) useFocusWindow.getState().reset();
  };

  const rethink = () => useFocusWindow.getState().patch({ confirmEnd: false });
  const togglePause = () => {
    if (!session || !run) return;
    rethink();
    void (run.paused ? actions.resume(session) : actions.pause(session));
  };
  const more = () => {
    if (!session) return;
    rethink();
    void actions.extend(session, MORE_MINUTES);
  };
  /**
   * End session: the clock has run out, or it is a break, and it ends at once;
   * a session with time left asks once ("End now? 12 min focused so far") and
   * the confirm ends it. No wait, no second press (the server agrees: a normal
   * session never holds an early end).
   */
  const stop = () => {
    if (!session || !run) return undefined;
    if (run.due) return finish("complete");
    if (run.isBreak) return finish("stopped");
    useFocusWindow.getState().patch({ confirmEnd: true });
    return undefined;
  };
  const endNow = () => {
    if (!session || !run) return undefined;
    return finish(run.due ? "complete" : "stopped");
  };
  const keepGoing = () => rethink();

  const takeBreak = async () => {
    const w = useFocusWindow.getState();
    const next = nextTask(tasks, w.summary?.taskId ?? null);
    const row = await actions.start({
      taskId: null,
      intention: "Break",
      plannedMinutes: BREAK_MINUTES,
      isBreak: true,
    });
    if (row) w.patch({ summary: null, breakAfter: next?.id ?? null });
  };
  const pickNext = (t: V3Task) =>
    useFocusWindow
      .getState()
      .patch({ summary: null, preset: t.id, note: null, draft: null });
  const done = () => {
    useFocusWindow.getState().patch({ summary: null });
    setOpen(false);
  };
  /** Esc, the backdrop, ×, Minimise: a running session folds into the pill. */
  const close = () => {
    // Esc backs out of the End session confirm before it folds the window.
    if (view === "run" && useFocusWindow.getState().confirmEnd) {
      rethink();
      return;
    }
    if (view === "end") useFocusWindow.getState().patch({ summary: null });
    setOpen(false);
  };

  return {
    open,
    view,
    tz,
    nowMs,
    tasks: tasks ?? [],
    openList,
    run: run as FocusRun | null,
    row: session as FocusRow | null,
    task,
    ui,
    draft,
    setDraft,
    sound,
    setSound,
    hide,
    setHide,
    stats: stats.data ?? null,
    begin,
    togglePause,
    more,
    stop,
    endNow,
    keepGoing,
    takeBreak,
    pickNext,
    done,
    close,
    /** The ids the End view's "Next task" would pick. */
    next: view === "end" ? nextTask(tasks, ui.summary?.taskId ?? null) : null,
  };
}

export type FocusController = ReturnType<typeof useFocusController>;
