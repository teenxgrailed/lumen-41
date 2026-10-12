"use client";

import type { ReactNode } from "react";

import { usePhoneUi } from "../../root/phone-ui-context";
import { PhoneHome } from "./PhoneHome";
import { type HomeController, useHomeController } from "./useHomeController";

/**
 * The Home route's face switch. The phone's state lives here, above the
 * switch (`useHomeController`) and handed to either face, so crossing 700 px
 * swaps what is drawn and loses nothing: the open sections, Skip, the
 * desktop's tab and rows mid-strike, the phone's rows mid-exit with their
 * write. `desktop` draws the desktop face from the same controller.
 */
export function HomeFaces({
  desktop,
}: {
  desktop: (ctl: HomeController) => ReactNode;
}) {
  const phone = usePhoneUi() === "phone";
  const ctl = useHomeController();
  return phone ? <PhoneHome ctl={ctl} /> : desktop(ctl);
}
