"use client";

import type { ReactNode } from "react";

import { usePhoneUi } from "../../root/phone-ui-context";
import { PhoneHome } from "./PhoneHome";
import { useHomeController } from "./useHomeController";

/**
 * The Home route's face switch. The phone's state lives here, above the
 * switch (`useHomeController`), so crossing 700 px swaps what is drawn and
 * loses nothing: the open sections, Skip, and a row that is mid-exit with
 * its write all stay. `desktop` is the desktop face, untouched.
 */
export function HomeFaces({ desktop }: { desktop: ReactNode }) {
  const phone = usePhoneUi() === "phone";
  const ctl = useHomeController();
  return phone ? <PhoneHome ctl={ctl} /> : desktop;
}
