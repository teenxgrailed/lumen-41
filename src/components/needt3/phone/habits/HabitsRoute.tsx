"use client";

import { HabitsScreen } from "../../habits/HabitsScreen";
import { usePhoneUi } from "../../root/phone-ui-context";
import { PhoneHabits } from "./PhoneHabits";
import { usePhoneHabits } from "./usePhoneHabits";

/**
 * The Habits route's body: the phone face under 700 px, the desktop screen
 * above. The phone controller is called here, above the face switch, so the
 * new / edit sheet, its draft and a running save belong to the route and not
 * to the face (crossing 700 px keeps the draft; a write is never repeated).
 * Its queries share keys with the desktop face, so calling it on a wide
 * screen fetches nothing extra. The desktop screen is not touched: it keeps
 * its own sheet state, and its writes go through the same mutation hooks.
 */
export function HabitsRoute() {
  const ui = usePhoneUi();
  const ctl = usePhoneHabits();
  return ui === "phone" ? <PhoneHabits ctl={ctl} /> : <HabitsScreen />;
}
