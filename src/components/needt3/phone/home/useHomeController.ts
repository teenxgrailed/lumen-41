"use client";

import { useRef, useState } from "react";

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

export type HomeFold = { tomorrow: boolean; done: boolean; habits: boolean };

/**
 * What the phone Home keeps that must outlive a face swap (the window crossing
 * 700 px): which sections are open, what Skip passed over, and the rows that
 * are on their way out together with their write. It is called once, by the
 * route component above the face switch (`HomeFaces`), and handed down — a
 * face that owned it would lose a half-played exit (the write would never be
 * sent) when the window is resized.
 *
 * The desktop Home keeps its own (tabs, folds by section name, the strike
 * timers); none of that has a phone equivalent, and nothing of it is a write.
 */
export function useHomeController() {
  const tz = useTimeZone();
  const tzRef = useRef(tz);
  tzRef.current = tz;
  const toggleTask = useToggleTask();
  const updateTask = useUpdateTask();

  const [fold, setFold] = useState<HomeFold>({
    tomorrow: true,
    done: true,
    habits: true,
  });
  const flip = (k: keyof HomeFold) => () =>
    setFold((f) => ({ ...f, [k]: !f[k] }));
  const [skipped, setSkipped] = useState<string[]>([]);
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

  return { fold, setFold, flip, skipped, setSkipped, gone, exit, check };
}

export type HomeController = ReturnType<typeof useHomeController>;
