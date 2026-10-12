"use client";

import type { ReactNode } from "react";

import { usePhoneUi } from "../../root/phone-ui-context";
import { PhoneCalendar } from "./PhoneCalendar";
import {
  type CalendarController,
  useCalendarController,
} from "./useCalendarController";

/**
 * The Calendar route's face switch. The phone's state lives here, above the
 * switch (`useCalendarController`) and handed to either face, so crossing
 * 700 px swaps what is drawn and keeps the phone's picked day, view and folds
 * and the desktop's paging, view and slot draft. `desktop` draws the desktop
 * face from the same controller.
 */
export function CalendarFaces({
  desktop,
}: {
  desktop: (ctl: CalendarController) => ReactNode;
}) {
  const phone = usePhoneUi() === "phone";
  const ctl = useCalendarController();
  return phone ? <PhoneCalendar ctl={ctl} /> : desktop(ctl);
}
