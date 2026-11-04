"use client";

import {
  HabitsScreen,
  archivedNotice,
  notifyHabitsBlocked,
} from "../../habits/HabitsScreen";
import { useQuitController } from "../../habits/quit/QuitHost";
import { useHabitsController } from "../../habits/useHabitsController";
import { usePhoneUi } from "../../root/phone-ui-context";
import { usePhoneOverlays } from "../overlays/store";
import { PhoneHabits } from "./PhoneHabits";
import { HABITS_PAYWALL_FEATURE } from "./model";

/**
 * The Habits route's body: the phone face under 700 px, the desktop screen
 * above. The controller is called here, above the face switch, and handed to
 * BOTH faces, so the new / edit sheet, its draft, "show all" and a running
 * save belong to the route: crossing 700 px keeps the draft and a write is
 * made once; the Quit state (the open Quit habit, a running pull) is held
 * here the same way. The only thing that differs by face is where a refused
 * add goes: the phone's paywall sheet, the desktop's notice.
 */
export function HabitsRoute() {
  const ui = usePhoneUi();
  const openPaywall = usePhoneOverlays((s) => s.openPaywall);
  const phone = ui === "phone";
  const ctl = useHabitsController({
    onBlocked: () =>
      phone ? openPaywall(HABITS_PAYWALL_FEATURE) : notifyHabitsBlocked(),
    ...(phone ? {} : { archivedMessage: archivedNotice }),
  });
  // The open Quit habit and a running pull survive crossing 700 px too.
  const quit = useQuitController();
  return phone ? (
    <PhoneHabits ctl={ctl} quit={quit} />
  ) : (
    <HabitsScreen ctl={ctl} quit={quit} />
  );
}
