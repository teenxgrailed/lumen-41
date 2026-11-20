"use client";

/* THE ONBOARDING MAP (design review, 2026-11-20): the proposed short flow
   that replaces the 19-screen /start, drawn as static mocks. Nothing here
   reads or writes anything: `/start?preview=map` shows all five steps with
   the list beside them, `/start?preview=map&step=3` one step full size (what
   the review shots use). The goal it is built to: "my plan for today" in
   about two minutes, every step skippable, no paywall on the way. */
import * as React from "react";

import { BrandIcon } from "../brand";
import { AuthScope } from "./AuthScope";
import { AuthSky } from "./AuthSky";

export interface MapStep {
  readonly n: number;
  readonly title: string;
  readonly what: string;
  /** Seconds a person is expected to spend; "skip" costs about 2. */
  readonly seconds: number;
}

export const MAP_STEPS: readonly MapStep[] = [
  {
    n: 1,
    title: "Name",
    what: "What to call you; time zone detected",
    seconds: 8,
  },
  {
    n: 2,
    title: "Your calendar",
    what: "Connect Google or Outlook, or skip and add by hand",
    seconds: 25,
  },
  {
    n: 3,
    title: "Today's tasks",
    what: "Two or three tasks with a rough length",
    seconds: 30,
  },
  {
    n: 4,
    title: "Your hours",
    what: "Work days and hours, pre-filled",
    seconds: 10,
  },
  {
    n: 5,
    title: "Your day",
    what: "Needt lays out today; the trial in one line",
    seconds: 12,
  },
];

export const MAP_TOTAL_SECONDS = MAP_STEPS.reduce((a, s) => a + s.seconds, 0);

function Progress({ n }: { n: number }) {
  return (
    <div className="omap-progress" role="img" aria-label={`Step ${n} of 5`}>
      <span className="omap-progress-bar" aria-hidden="true">
        {MAP_STEPS.map((s) => (
          <i key={s.n} data-on={s.n <= n ? "true" : undefined} />
        ))}
      </span>
      <span className="omap-progress-n">{n} of 5</span>
    </div>
  );
}

function Foot({
  primary,
  skip = "Skip",
}: {
  primary: string;
  skip?: string | null;
}) {
  return (
    <div className="omap-foot">
      <button type="button" className="nx-btn nx-btn-primary axs-go">
        {primary}
      </button>
      {skip ? (
        <button type="button" className="ax-link omap-skip">
          {skip}
        </button>
      ) : null}
    </div>
  );
}

function Screen({
  n,
  title,
  em,
  line,
  children,
}: React.PropsWithChildren<{
  n: number;
  title: string;
  em: string;
  line: string;
}>) {
  return (
    <section className="omap-screen" data-omap-step={n}>
      <Progress n={n} />
      <h2 className="px-display omap-h">
        {title} <em>{em}</em>
      </h2>
      <p className="omap-line">{line}</p>
      {children}
    </section>
  );
}

const TASKS: ReadonlyArray<readonly [string, string]> = [
  ["Draft the proposal", "90 min"],
  ["Reply to Anna", "15 min"],
  ["Gym", "45 min"],
];

const DAY: ReadonlyArray<readonly [string, string, string]> = [
  ["09:00", "Draft the proposal", "90 min"],
  ["10:30", "Standup", "Google Calendar"],
  ["11:15", "Reply to Anna", "15 min"],
  ["12:30", "Lunch", "Kept free"],
  ["14:00", "Gym", "45 min"],
];

function StepBody({ n }: { n: number }) {
  if (n === 1)
    return (
      <Screen
        n={1}
        title="What should we"
        em="call you?"
        line="Only your first name. You can change it later."
      >
        <div className="omap-body">
          <span className="auth-field-row">
            <input
              className="auth-field-input omap-input"
              aria-label="Name"
              defaultValue="Alex"
              readOnly
            />
          </span>
          <p className="omap-hint">Time zone: Europe/Zurich, detected.</p>
        </div>
        <Foot primary="Continue" />
      </Screen>
    );
  if (n === 2)
    return (
      <Screen
        n={2}
        title="Bring your day"
        em="in"
        line="Needt plans around what is already booked. Read only."
      >
        <div className="omap-body">
          <button type="button" className="ax-btn ax-raised auth-oauth">
            <BrandIcon id="gcal" size={18} />
            Connect Google Calendar
          </button>
          <button type="button" className="ax-btn ax-raised auth-oauth">
            <BrandIcon id="ocal" size={18} />
            Connect Outlook
          </button>
        </div>
        <Foot primary="Continue" skip="No calendar, I will add tasks by hand" />
      </Screen>
    );
  if (n === 3)
    return (
      <Screen
        n={3}
        title="What is on your"
        em="plate today?"
        line="Two or three is enough. Needt guesses the time."
      >
        <div className="omap-body">
          {TASKS.map(([t, d]) => (
            <div key={t} className="omap-row">
              <span className="omap-dot" aria-hidden="true" />
              <span className="omap-row-t">{t}</span>
              <span className="omap-chip">{d}</span>
            </div>
          ))}
          <button type="button" className="ax-link omap-add">
            Add another
          </button>
        </div>
        <Foot primary="Plan my day" skip="Use examples" />
      </Screen>
    );
  if (n === 4)
    return (
      <Screen
        n={4}
        title="When do you"
        em="work?"
        line="Pre-filled from your calendar. Tap to change."
      >
        <div className="omap-body">
          <div className="omap-days" role="group" aria-label="Work days">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
              <span
                key={d}
                className="omap-day"
                data-on={i < 5 ? "true" : undefined}
              >
                {d}
              </span>
            ))}
          </div>
          <div className="omap-hours">
            <span className="omap-chip">09:00</span>
            <span aria-hidden="true">to</span>
            <span className="omap-chip">17:30</span>
          </div>
        </div>
        <Foot primary="Looks right" />
      </Screen>
    );
  return (
    <Screen
      n={5}
      title="Here is"
      em="your day"
      line="Moves on its own when something changes."
    >
      <div className="omap-body">
        {DAY.map(([time, t, meta]) => (
          <div key={time} className="omap-slot">
            <span className="omap-time">{time}</span>
            <span className="omap-row-t">{t}</span>
            <span className="omap-meta">{meta}</span>
          </div>
        ))}
        <p className="omap-hint">
          You are on a 14-day Pro trial. After that Free, unless you pick a
          plan.
        </p>
      </div>
      <Foot primary="Open Today" skip={null} />
    </Screen>
  );
}

export function OnboardingMap({ step }: { step?: string }) {
  const one = MAP_STEPS.find((s) => String(s.n) === step);
  return (
    <AuthScope>
      <div className="omap" data-omap={one ? "one" : "all"}>
        <AuthSky variant="b">
          <div className="omap-scroll">
            {one ? (
              <div className="omap-card omap-card-one">
                <StepBody n={one.n} />
              </div>
            ) : (
              <>
                <header className="omap-head">
                  <span className="px-kicker">Proposal</span>
                  <h1 className="px-display">
                    Sign up to <em>your day</em> in about two minutes
                  </h1>
                  <p className="omap-line">
                    Five steps after the account, every one skippable, no
                    paywall in between. About {MAP_TOTAL_SECONDS} seconds of
                    typing and tapping, plus the sign-up (about 25).
                  </p>
                  <ol className="omap-list">
                    {MAP_STEPS.map((s) => (
                      <li key={s.n}>
                        <b>{s.title}</b>
                        <span>{s.what}</span>
                        <em>{s.seconds}s</em>
                      </li>
                    ))}
                  </ol>
                </header>
                <div className="omap-grid">
                  {MAP_STEPS.map((s) => (
                    <div key={s.n} className="omap-card">
                      <StepBody n={s.n} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </AuthSky>
      </div>
    </AuthScope>
  );
}
