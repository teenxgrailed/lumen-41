"use client";

/* THE FOCUS WINDOW, phone face. The prototype's phone only ever said "Focus
   started" in a snack; there is no phone mockup of the window. So the phone
   draws the same three views, on the same sky, in the phone kit's full sheet
   (as the phone paywall does): swipe down or the round button puts it away
   and a running session carries on. */
import { useEffect, useState } from "react";

import { PkSheet } from "../phone/kit";
import { PxSky } from "../scenes";
import { FocusView } from "./FocusViews";
import { win } from "./strings";
import type { FocusController } from "./useFocusController";

export function PhoneFocus({ ctl }: { ctl: FocusController }) {
  // The sky paints while the sheet is open or settling, not while shut.
  const [sky, setSky] = useState(ctl.open);
  useEffect(() => {
    if (ctl.open) setSky(true);
  }, [ctl.open]);
  return (
    <PkSheet
      open={ctl.open}
      onClose={ctl.close}
      onShut={() => setSky(false)}
      detents={[0.95]}
      label={ctl.view === "run" ? win.focus_session : win.focus}
      className="pov-focus"
      bodyClass="pov-focus-body"
    >
      <div className="fc-phone" data-px-scope="" data-fc-window={ctl.view}>
        {ctl.open || sky ? (
          <PxSky variant="a" radius={0}>
            <div className="fc-scroll scroll-inner nx-scroll">
              <FocusView ctl={ctl} />
            </div>
          </PxSky>
        ) : null}
      </div>
    </PkSheet>
  );
}
