"use client";

import { useState } from "react";

import type { CalView } from "./model";

export type CalendarFold = { past: boolean; loose: boolean };

/**
 * What the phone Calendar keeps that must outlive a face swap (the window
 * crossing 700 px): the picked day (`null` = follow today), Schedule or Month,
 * and the two folds. Called once, by the route component above the face
 * switch (`CalendarFaces`), and handed down. The new-event draft and the open
 * sheets are in the overlay store; the week the desktop face shows is its
 * own paging (`weekFrom` …) and Hide done is a saved preference.
 */
export function useCalendarController() {
  const [view, setView] = useState<CalView>("schedule");
  const [picked, setPicked] = useState<string | null>(null);
  const [fold, setFold] = useState<CalendarFold>({ past: true, loose: true });
  const flip = (k: keyof CalendarFold) => () =>
    setFold((f) => ({ ...f, [k]: !f[k] }));
  return { view, setView, picked, setPicked, fold, flip };
}

export type CalendarController = ReturnType<typeof useCalendarController>;
