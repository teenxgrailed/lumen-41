"use client";

import { usePhoneUi } from "../root/phone-ui-context";
import { FocusWindow } from "./FocusWindow";
import { PhoneFocus } from "./PhoneFocus";
import { useFocusController } from "./useFocusController";

/**
 * The Focus window's host. The controller lives here, above the desktop /
 * phone switch, and is handed to whichever face is drawn, so crossing 700 px
 * keeps the session, the form, the End view and the early Stop's wait (the
 * same arrangement as the Home and onboarding controllers). The host is a
 * permanent sibling in the frame (PermanentHosts), so the shell's own UI swap
 * never remounts it either. Nothing is drawn while the window is shut; the
 * controller still ends a session whose clock runs out and keeps the tab
 * title.
 */
export function FocusHost() {
  const ctl = useFocusController();
  const phone = usePhoneUi() === "phone";
  return phone ? <PhoneFocus ctl={ctl} /> : <FocusWindow ctl={ctl} />;
}
