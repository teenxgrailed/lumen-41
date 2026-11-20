"use client";

/* THE RUNNING SESSION, phone face: one full screen on the task's own colour.
   A big ring is the clock; the task's icon and title sit above it; Pause,
   Done and +5 min under it. The accent is the ring's mark and nothing else.

   Cheap by design: the only things that move on their own are a halo that
   breathes (opacity and transform, 5.2 s, the product's one living period)
   and the ring's tip (a transform). They stop while paused, while the tab is
   hidden and under reduced motion. The ring's arc is redrawn once a second
   with the clock, never per frame, and holds no state of its own. */
import { useEffect, useRef } from "react";

import { LuCheck, LuChevronDown, LuPlus } from "react-icons/lu";

import { cvDur, cvProject } from "@/lib/needt3/derive";
import { clockOf, endsAt } from "@/lib/needt3/focus";
import { useProjects } from "@/lib/needt3/hooks/projects";

import { TaskGlyph } from "../phone/home/TaskGlyph";
import { GlassCard } from "../scenes";
import { FcSoundPicker } from "./FcSoundPicker";
import { FdEarlyAsk } from "./FdEarlyAsk";
import { FcEndConfirm, FcGlyph } from "./FocusViews";
import * as copy from "./strings";
import type { FocusController } from "./useFocusController";

/** The ring is drawn on a 300 grid; the arc is 1000 units round. */
const R = 128;
const UNITS = 1000;

export function PhoneFocusRun({ ctl }: { ctl: FocusController }) {
  const { run, task } = ctl;
  const projects = useProjects().data ?? [];
  const root = useRef<HTMLDivElement>(null);

  // A hidden tab stops the halo and the tip without a render.
  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const sync = () => {
      if (document.hidden) el.dataset.hidden = "";
      else delete el.dataset.hidden;
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  if (!run) return null;
  const mark = cvProject(task?.projectId, projects);
  const title = run.isBreak
    ? copy.run.break
    : (task?.title ?? run.intention ?? copy.run.focus);
  const purpose =
    !run.isBreak && run.intention && task && run.intention !== task.title
      ? run.intention
      : null;
  const clock = clockOf(run);
  const planned = run.plannedMinutes;
  const ends = endsAt(run, ctl.nowMs, ctl.tz);
  const pct = Math.min(1, Math.max(0, run.pct));
  const confirming = ctl.ui.confirmEnd && !run.isBreak;
  const focusedMin = Math.round(run.elapsedSec / 60);
  const kicker = run.paused
    ? copy.run.paused
    : run.isBreak
      ? copy.run.on_a_break
      : copy.run.in_focus;

  return (
    <div
      ref={root}
      className="fcr fc-view"
      data-fcr=""
      data-fc-view="run"
      data-paused={run.paused ? "" : undefined}
      data-break={run.isBreak ? "" : undefined}
      style={{ "--fc-hue": mark.color } as React.CSSProperties}
    >
      <div className="fcr-top">
        <button
          type="button"
          className="px-chip-btn fc-round"
          aria-label={copy.phoneRun.minimise}
          title={copy.phoneRun.minimise}
          onClick={ctl.close}
          data-fc-action="minimise"
        >
          <LuChevronDown size={16} aria-hidden="true" />
        </button>
        <FcSoundPicker
          sound={ctl.sound}
          onPick={ctl.setSound}
          placement="down"
        />
      </div>

      <div className="fcr-main">
        <div className="fcr-who" data-px-calm="">
          <span className="fcr-icon" aria-hidden="true">
            {run.isBreak ? (
              <FcGlyph name="coffee" size={18} />
            ) : (
              <TaskGlyph title={title} size={18} />
            )}
          </span>
          <span className="fcr-kicker">{kicker}</span>
        </div>
        <h2 className="px-display px-on-sky fcr-title">{title}</h2>
        {purpose ? <span className="fcr-sub">{purpose}</span> : null}

        <div className="fcr-ringwrap" data-px-calm="">
          <span className="fcr-halo" aria-hidden="true" />
          <svg
            className="fcr-ring"
            viewBox="0 0 300 300"
            aria-hidden="true"
            data-fcr-ring=""
          >
            <circle className="fcr-track" cx="150" cy="150" r={R} />
            {planned != null ? (
              <>
                <circle
                  className="fcr-arc"
                  cx="150"
                  cy="150"
                  r={R}
                  pathLength={UNITS}
                  strokeDasharray={`${Math.round(pct * UNITS)} ${UNITS}`}
                />
                <g
                  className="fcr-tip"
                  style={{ transform: `rotate(${(pct * 360).toFixed(2)}deg)` }}
                >
                  <circle cx="150" cy={150 - R} r="6.5" />
                </g>
              </>
            ) : null}
          </svg>
          <div className="fcr-face">
            <span
              className="px-display px-on-sky fcr-clock"
              data-fc-clock=""
              role="timer"
              aria-label={clock + (run.leftSec == null ? "" : " left")}
            >
              {clock}
            </span>
            <span className="fcr-meta px-on-sky">
              {planned != null ? copy.sessionLine(cvDur(planned), ends) : ""}
            </span>
          </div>
        </div>
      </div>

      {confirming ? (
        <GlassCard
          pad={0}
          radius={20}
          className="fc-card fc-card-end fcr-confirm"
          style={{ padding: "16px 18px" }}
          data-fc-confirm=""
          role="alertdialog"
          aria-label={copy.endSession}
        >
          <span className="fc-end-line">
            {copy.endAsk(
              copy.focusedSoFar(focusedMin >= 1 ? cvDur(focusedMin) : null)
            )}
          </span>
          <span className="fc-end-actions">
            <FcEndConfirm
              onEnd={() => void ctl.endNow()}
              onKeep={ctl.keepGoing}
            />
          </span>
        </GlassCard>
      ) : null}

      {ctl.askingFullTime && task ? (
        <FdEarlyAsk
          title={task.title}
          leftMin={ctl.fullTimeLeftMin ?? 0}
          plannedMin={run.plannedMinutes}
          onKeep={ctl.keepGoingFullTime}
          onEnd={() => void ctl.endFullTimeNow()}
        />
      ) : null}

      <div className="fcr-foot">
        <div className="fcr-controls">
          <button
            type="button"
            className="nx-btn nx-btn-primary fcr-btn fcr-pause"
            onClick={ctl.togglePause}
            data-fc-pause=""
          >
            <FcGlyph name={run.paused ? "play" : "pause"} size={15} />
            {run.paused ? copy.run.resume : copy.run.pause}
          </button>
          {run.isBreak ? (
            <button
              type="button"
              className="nx-btn nx-btn-secondary fcr-btn"
              onClick={() => void ctl.stop()}
              data-fc-stop=""
            >
              {copy.phoneRun.endBreak}
            </button>
          ) : (
            <button
              type="button"
              className="nx-btn nx-btn-secondary fcr-btn"
              onClick={() => void ctl.doneTask()}
              disabled={!task}
              data-fc-done-task=""
            >
              <LuCheck size={15} aria-hidden="true" />
              {copy.phoneRun.done}
            </button>
          )}
          <button
            type="button"
            className="nx-btn nx-btn-secondary fcr-btn"
            onClick={ctl.more}
            data-fc-more=""
          >
            <LuPlus size={15} aria-hidden="true" />
            {copy.phoneRun.more}
          </button>
        </div>
        {!run.isBreak ? (
          <button
            type="button"
            className="fcr-end"
            onClick={() => void ctl.stop()}
            aria-expanded={confirming}
            data-fc-stop=""
          >
            {copy.endSession}
          </button>
        ) : null}
      </div>
    </div>
  );
}
