"use client";

import { useState } from "react";

import { weekday } from "@/lib/needt3/derive";
import { useSchedule } from "@/lib/needt3/hooks/account";

import { workHoursOf } from "../calendar/strip";
import { inNudgeWindow, nudgeOff, setNudgeOff, workEndToday } from "./nudge";

/**
 * Whether Home gently asks to End day: in the last half hour of today's
 * working hours (the schedule's per-day windows), once, unless dismissed or
 * the day was already ended. `hidden` keeps it away while End day is already
 * on screen another way.
 */
export function useEndDayNudge(o: {
  today: string;
  nowHour: number;
  hidden: boolean;
}) {
  const schedule = useSchedule().data;
  const [, bump] = useState(0);
  const end = workEndToday(workHoursOf(schedule), weekday(o.today));
  const show = !o.hidden && inNudgeWindow(o.nowHour, end) && !nudgeOff(o.today);
  return {
    show,
    dismiss: () => {
      setNudgeOff(o.today);
      bump((n) => n + 1);
    },
  };
}
