"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import {
  type CloseChoice,
  type DayPlanSnapshot,
  closeBody,
  leftoversOf,
  tomorrowPreview,
} from "@/lib/needt3/day-plan";
import { addDays } from "@/lib/needt3/derive";
import { useCloseDay, useDayPlan } from "@/lib/needt3/hooks/day-plan";
import { notify } from "@/lib/notifications";

import { setNudgeOff } from "../../home/nudge";
import { weekdayLong, weekdayOf } from "../../home/stats-model";

/**
 * The evening close behind the phone's End day, state and writes: the picks,
 * the note, tomorrow's preview and the one close call. `fallback` runs the old
 * End day when the server says the plan is switched off.
 */
export function useCloseFlow({
  today,
  snapshot,
  fallback,
}: {
  today: string;
  snapshot: DayPlanSnapshot | undefined;
  fallback: () => void;
}) {
  const tomorrow = addDays(today, 1);
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<Record<string, CloseChoice>>({});
  const [note, setNote] = useState("");
  const [overflow, setOverflow] = useState(false);
  const { close: send, busy } = useCloseDay();
  // the note becomes tomorrow's draft once, even when Close is tried again
  const noteSent = useRef(false);
  const tomorrowPlan = useDayPlan(tomorrow, open);

  const plan = snapshot?.plan ?? null;
  const leftovers = useMemo(() => leftoversOf(plan), [plan]);
  const limit = snapshot?.settings?.taskLimit ?? 0;
  const preview = tomorrowPreview(
    tomorrowPlan.data?.plan,
    leftovers,
    choices,
    limit
  );

  const show = useCallback(() => {
    setChoices({});
    setNote("");
    setOverflow(false);
    noteSent.current = false;
    setOpen(true);
  }, []);
  const hide = useCallback(() => setOpen(false), []);

  const submit = useCallback(async () => {
    if (!plan || busy) return;
    const outcome = await send({
      body: closeBody(plan.date, leftovers, choices, overflow),
      tomorrow,
      note: noteSent.current ? "" : note,
    });
    if (outcome === "closed") {
      setNudgeOff(today);
      setOpen(false);
      notify.success("Day closed");
    } else if (outcome === "overflow") {
      noteSent.current = true;
      setOverflow(true);
    } else if (outcome === "off") {
      setOpen(false);
      fallback();
    }
  }, [
    plan,
    busy,
    send,
    leftovers,
    choices,
    overflow,
    tomorrow,
    note,
    today,
    fallback,
  ]);

  return {
    open,
    show,
    close: hide,
    sheet: {
      open,
      title: `End of ${weekdayLong(weekdayOf(today))}`,
      leftovers,
      choices,
      preview,
      note,
      busy,
      overflow,
      onChoose: (id: string, c: CloseChoice) => {
        setChoices((m) => ({ ...m, [id]: c }));
        setOverflow(false);
      },
      onNote: setNote,
      onSubmit: () => void submit(),
      onClose: hide,
    },
  };
}
