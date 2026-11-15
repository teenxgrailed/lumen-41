"use client";

/* Learn's screens on the phone sit in the phone kit's screen (`PkScreen`),
   as Trash, Templates and Tasks do: the page scrolls from under the 52px
   status bar with the kit's 20px sides, the fog sits behind the menu pill
   and the tail clears it. On the desktop the screen is drawn as it is. */
import type { ReactNode } from "react";

import { PkScreen } from "../phone/kit/Screen";
import { usePhoneUi } from "../root/phone-ui-context";

export function LearnFrame({
  screen,
  children,
}: {
  screen: string;
  children: ReactNode;
}) {
  if (usePhoneUi() !== "phone") return <>{children}</>;
  return (
    <PkScreen screen={screen} className="ln-phone">
      {children}
    </PkScreen>
  );
}
