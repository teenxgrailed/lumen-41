"use client";

import type { ReactNode } from "react";

import { usePhoneUi } from "../../root/phone-ui-context";
import { PhoneCalendar } from "./PhoneCalendar";
import { useCalendarController } from "./useCalendarController";

/**
 * The Calendar route's face switch. The phone's state lives here, above the
 * switch (`useCalendarController`), so crossing 700 px swaps what is drawn
 * and keeps the picked day, the view and the folds. `desktop` is the desktop
 * face, untouched.
 */
export function CalendarFaces({ desktop }: { desktop: ReactNode }) {
  const phone = usePhoneUi() === "phone";
  const ctl = useCalendarController();
  return phone ? <PhoneCalendar ctl={ctl} /> : desktop;
}
