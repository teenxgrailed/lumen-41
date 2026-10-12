"use client";

import { useEffect, useRef, useState } from "react";

import { newDate } from "@/lib/date-utils";
import { laterPatch } from "@/lib/needt3/day";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { useToggleTask, useUpdateTask } from "@/lib/needt3/hooks/tasks";
import type { V3Task } from "@/lib/needt3/map";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import { usePkExit } from "../kit";
import { snack } from "../overlays/snack";
import { dayIn } from "../overlays/today";

const none = () => undefined;

/** A row's exit on the desktop Home: the strike plays, then the row collapses. */
export type HomePhase = "strike" | "collapse";
/** The desktop Home's tabs. */
export type HomeTab = "day" | "week";
/** Section name → folded. Both faces: `done` is the same fold on either. */
export type HomeFold = Record<string, boolean>;

/**
 * What the Home route keeps that must outlive a face swap (the window
 * crossing 700 px): created once, by `HomeFaces` above the switch, and handed
 * to BOTH faces. Shared by name: which sections are folded, and what Skip
 * passed over. The desktop face's own: its tab, and the rows playing their
 * strike / return (with the timers that end them, which therefore belong here:
 * a face that cleared them on unmount would leave a row struck for good). The
 * phone face's own: the rows on their way out with their write, and the
 * hold-out set that keeps a row from blinking back.
 */
export function useHomeController() {
  const tz = useTimeZone();
  const tzRef = useRef(tz);
  tzRef.current = tz;
  const toggleTask = useToggleTask();
  const updateTask = useUpdateTask();

  const [fold, setFold] = useState<HomeFold>({
    done: true,
    tomorrow: true,
    habits: true,
  });
  const flip = (k: string) => () => setFold((f) => ({ ...f, [k]: !f[k] }));
  const [skipped, setSkipped] = useState<string[]>([]);

  // the desktop face's
  const [tab, setTab] = useState<HomeTab>("day");
  const [leaving, setLeaving] = useState<Record<string, HomePhase>>({});
  const [back, setBack] = useState<Record<string, boolean>>({});
  const closed = useRef<string[]>([]);
  const timers = useRef<Record<string, number[]>>({});
  useEffect(() => {
    const live = timers.current;
    return () => Object.values(live).forEach((l) => l.forEach(clearTimeout));
  }, []);
  // Ids whose write is in flight after the row has left: they stay out of the
  // lists until the optimistic change lands, so a row never blinks back.
  const [gone, setGone] = useState<Record<string, 1>>({});
  const hide = (id: string, on: boolean) =>
    setGone((m) => {
      if (on) return { ...m, [id]: 1 };
      const n = { ...m };
      delete n[id];
      return n;
    });

  /** A row leaves in steps (check shows → folds shut), then this writes. */
  const exit = usePkExit<V3Task>((t, kind) => {
    hide(t.id, true);
    const run =
      kind === "later"
        ? updateTask
            .mutateAsync({
              id: t.id,
              patch: laterPatch(t, dayIn(newDate(), tzRef.current)),
            })
            .then(({ undo }) =>
              snack(strings["mobile-v2-plates.jsx"].X.moved_to_tomorrow, undo)
            )
        : toggleTask.toggle(t);
    void run.catch(none).finally(() => hide(t.id, false));
  });

  /** The ring: a closed task reopens at once, an open one leaves in steps. */
  const check = (t: V3Task) => {
    if (t.done) void toggleTask.toggle(t).catch(none);
    else exit.exit(t, "check");
  };

  return {
    fold,
    setFold,
    flip,
    skipped,
    setSkipped,
    gone,
    exit,
    check,
    tab,
    setTab,
    leaving,
    setLeaving,
    back,
    setBack,
    closed,
    timers,
  };
}

export type HomeController = ReturnType<typeof useHomeController>;
