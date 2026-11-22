"use client";

/* THE FOCUS WINDOW, phone face: a full-screen sheet on the task's own colour
   (a tint of its project's hue over the ground, plus paper grain, as on the
   project folders). The prototype's phone only ever said "Focus started" in a
   snack, so the phone draws the three views itself: setup and the end go
   through the shared views, the running session has its own screen with a big
   ring (PhoneFocusRun). Swipe down or the round button puts it away and a
   running session carries on. While a session runs the screen stays awake. */
import { useEffect, useState } from "react";

import { cvProject } from "@/lib/needt3/derive";
import { useProjects } from "@/lib/needt3/hooks/projects";

import { PkSheet } from "../phone/kit";
import { paperGrain } from "../scenes/PxSky";
import { FocusView } from "./FocusViews";
import { PhoneFocusRun } from "./PhoneFocusRun";
import { win } from "./strings";
import type { FocusController } from "./useFocusController";
import { useWakeLock } from "./useWakeLock";

export function PhoneFocus({ ctl }: { ctl: FocusController }) {
  // The ground paints while the sheet is open or settling, not while shut.
  const [shown, setShown] = useState(ctl.open);
  const [grain, setGrain] = useState("");
  useEffect(() => {
    if (ctl.open) setShown(true);
  }, [ctl.open]);
  useEffect(() => {
    if (shown && !grain) setGrain(paperGrain());
  }, [shown, grain]);
  useWakeLock(ctl.open && !!ctl.run);

  const projects = useProjects().data ?? [];
  const taskId =
    ctl.view === "run"
      ? ctl.run?.taskId
      : ctl.view === "end"
        ? ctl.ui.summary?.taskId
        : ctl.draft.taskId;
  const task = taskId ? ctl.tasks.find((t) => t.id === taskId) : undefined;
  const hue = cvProject(task?.projectId, projects).color;

  return (
    <PkSheet
      open={ctl.open}
      onClose={ctl.close}
      onShut={() => setShown(false)}
      detents={[1]}
      label={ctl.view === "run" ? win.focus_session : win.focus}
      className="pov-focus"
      bodyClass="pov-focus-body"
    >
      <div
        className="fc-phone"
        data-px-scope=""
        data-fc-window={ctl.view}
        style={{ "--fc-hue": hue } as React.CSSProperties}
      >
        {ctl.open || shown ? (
          <div className="fcg" data-fcg="">
            <span className="fcg-tint" aria-hidden="true" />
            <span
              className="fcg-grain"
              aria-hidden="true"
              style={grain ? { backgroundImage: `url(${grain})` } : undefined}
            />
            <div className="fc-scroll scroll-inner nx-scroll">
              {ctl.view === "run" ? (
                <PhoneFocusRun ctl={ctl} />
              ) : (
                <FocusView ctl={ctl} />
              )}
            </div>
          </div>
        ) : null}
      </div>
    </PkSheet>
  );
}
