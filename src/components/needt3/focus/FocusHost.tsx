"use client";

import { useEffect } from "react";

import { setUnsavedWork } from "@/lib/pwa/unsaved-work";

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
  // A running (or paused) session is work in progress: the automatic reload
  // for a new version waits until it ends. This host is mounted once, so it
  // is the one writer of the flag.
  const active = !!ctl.row;
  useEffect(() => {
    setUnsavedWork("focus-session", active);
    return () => setUnsavedWork("focus-session", false);
  }, [active]);
  return phone ? <PhoneFocus ctl={ctl} /> : <FocusWindow ctl={ctl} />;
}
