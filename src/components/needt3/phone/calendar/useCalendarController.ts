"use client";

import { useState } from "react";

import type { AgendaSize } from "../../calendar/DaysView";
import type { Draft } from "../../calendar/WeekView";
import type { CalView } from "./model";

/** The desktop calendar's views. */
export type DesktopView = "week" | "days";
export type CalendarFold = { past: boolean; loose: boolean };

/**
 * What the Calendar route keeps that must outlive a face swap (the window
 * crossing 700 px): created once, by `CalendarFaces` above the switch, and
 * handed to BOTH faces.
 *
 * The phone's: the picked day (`null` = follow today), Schedule or Month, the
 * two folds. The desktop's: the view / Hide done / Agenda size that answer at
 * once while the saved preference lands, the week, three days and Agenda
 * span being paged, and the event being drafted in a slot. The new-event
 * draft of the phone and the open sheets are in the overlay store.
 */
export function useCalendarController() {
  const [view, setView] = useState<CalView>("schedule");
  const [picked, setPicked] = useState<string | null>(null);
  const [fold, setFold] = useState<CalendarFold>({ past: true, loose: true });
  const flip = (k: keyof CalendarFold) => () =>
    setFold((f) => ({ ...f, [k]: !f[k] }));

  // the desktop face's
  const [viewLocal, setViewLocal] = useState<DesktopView | null>(null);
  const [hideLocal, setHideLocal] = useState<boolean | null>(null);
  const [nLocal, setNLocal] = useState<AgendaSize | null>(null);
  const [weekFrom, setWeekFrom] = useState<string | null>(null);
  const [narrowFrom, setNarrowFrom] = useState<string | null>(null);
  const [agendaFrom, setAgendaFrom] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  return {
    view,
    setView,
    picked,
    setPicked,
    fold,
    flip,
    viewLocal,
    setViewLocal,
    hideLocal,
    setHideLocal,
    nLocal,
    setNLocal,
    weekFrom,
    setWeekFrom,
    narrowFrom,
    setNarrowFrom,
    agendaFrom,
    setAgendaFrom,
    draft,
    setDraft,
  };
}

export type CalendarController = ReturnType<typeof useCalendarController>;
