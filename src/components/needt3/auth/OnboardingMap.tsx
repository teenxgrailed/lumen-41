"use client";

/* THE ONBOARDING MAP (design review, 2026-11-20): the proposed short flow that
   replaces the 19-screen /start, as a clickable mock in the sign-in's card
   language (the sky, one frosted card, the app icon on its edge; a "choose a
   service" step is a grid of tiles with a line each, as in the Craft import
   reference). Nothing here reads or writes the account: `/start?preview=map`
   runs the four steps (the step you are on survives a reload, in this
   browser), `&step=3` pins one step for the review shots, `&step=4&plan=1`
   shows the plan.

   The rules it is built to (the Sunsama onboarding the owner reviewed): about
   two minutes from sign-up to a first plan, one question per screen with one
   grey line under it, Back and Next on every screen, everything skippable, a
   thin progress line across the top, no paywall on the way (the trial is one
   line on the last screen). */
import * as React from "react";

import { addCalendarDays, newDate } from "@/lib/date-utils";
import { keepProDate } from "@/lib/needt3/paywall";

import { BrandIcon } from "../brand";
import { NeedtAppIcon } from "../wordmark";
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
    title: "Your hours",
    what: "When you work and when to plan, pre-filled",
    seconds: 12,
  },
  {
    n: 2,
    title: "Where your work lives",
    what: "Pick the calendar and tools you already use",
    seconds: 20,
  },
  {
    n: 3,
    title: "Your AI",
    what: "Claude, ChatGPT or Codex can use Needt",
    seconds: 15,
  },
  {
    n: 4,
    title: "Your day",
    what: "Say what you want to do today, get a timed plan",
    seconds: 35,
  },
];

export const MAP_TOTAL_SECONDS = MAP_STEPS.reduce((a, s) => a + s.seconds, 0);

const STORE_KEY = "needt-onboarding-map-step";

/** What each tile in "Where your work lives" is. Only providers Needt has
    code for (the integration catalog): the three calendars, Google Tasks and
    the Composio toolkits. */
const WORK_TOOLS: ReadonlyArray<readonly [string, string, string]> = [
  ["gcal", "Google Calendar", "Your events, live"],
  ["ocal", "Outlook", "Work or school calendar"],
  ["ical", "Apple Calendar", "iCloud, through CalDAV"],
  ["gtasks", "Google Tasks", "Import your task lists"],
  ["todoist", "Todoist", "Tasks and projects"],
  ["notion", "Notion", "Pages and databases"],
  ["linear", "Linear", "Issues assigned to you"],
  ["gmail", "Gmail", "Turn mail into tasks"],
  ["slack", "Slack", "Messages and updates"],
];

const AI_TOOLS: ReadonlyArray<readonly [string, string, string]> = [
  ["claude", "Claude", "Plan and edit from a chat"],
  ["chatgpt", "ChatGPT", "Add Needt as a connector"],
  ["codex", "Codex", "Give your agent a token"],
];

const DAY: ReadonlyArray<readonly [string, string, string]> = [
  ["09:00", "Draft the proposal", "90 min"],
  ["10:30", "Standup", "Google Calendar"],
  ["11:15", "Reply to Anna", "15 min"],
  ["12:30", "Lunch", "Kept free"],
  ["14:00", "Gym", "45 min"],
];

function Tiles({
  items,
  picked,
  onPick,
  label,
}: {
  items: ReadonlyArray<readonly [string, string, string]>;
  picked: ReadonlySet<string>;
  onPick: (id: string) => void;
  label: string;
}) {
  return (
    <div className="omap-tiles" role="group" aria-label={label}>
      {items.map(([id, name, what]) => (
        <button
          key={id}
          type="button"
          className="omap-tile"
          aria-pressed={picked.has(id)}
          data-on={picked.has(id) ? "true" : undefined}
          onClick={() => onPick(id)}
        >
          <BrandIcon id={id} size={30} />
          <b>{name}</b>
          <span>{what}</span>
        </button>
      ))}
    </div>
  );
}

function Hours() {
  const [when, setWhen] = React.useState<"morning" | "night">("morning");
  return (
    <>
      <div className="omap-hours">
        <label>
          <span>Start</span>
          <input
            className="auth-field-input omap-input"
            defaultValue="09:00"
            inputMode="numeric"
            aria-label="Start time"
          />
        </label>
        <label>
          <span>Wrap up</span>
          <input
            className="auth-field-input omap-input"
            defaultValue="17:30"
            inputMode="numeric"
            aria-label="Wrap-up time"
          />
        </label>
      </div>
      <div className="omap-seg" role="group" aria-label="When to plan">
        {(
          [
            ["morning", "Plan in the morning"],
            ["night", "Plan the night before"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={when === id}
            data-on={when === id ? "true" : undefined}
            onClick={() => setWhen(id)}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

function Today({
  planned,
  onPlan,
  noCalendar,
}: {
  planned: boolean;
  onPlan: () => void;
  noCalendar: boolean;
}) {
  return (
    <>
      <textarea
        className="omap-text"
        aria-label="What you want to do today"
        placeholder="Draft the proposal, reply to Anna, gym after lunch"
        defaultValue={planned ? "Draft the proposal, reply to Anna, gym" : ""}
        rows={3}
      />
      {planned ? (
        <div className="omap-plan" aria-label="Your plan for today">
          {DAY.map(([time, t, meta]) => (
            <div key={time} className="omap-slot">
              <span className="omap-time">{time}</span>
              <span className="omap-row-t">{t}</span>
              <span className="omap-meta">{meta}</span>
            </div>
          ))}
        </div>
      ) : (
        <button
          type="button"
          className="nx-btn nx-btn-primary axs-go omap-go"
          onClick={onPlan}
        >
          Plan my day
        </button>
      )}
      {noCalendar ? (
        <p className="omap-hint">Better with a calendar and a task tool.</p>
      ) : null}
      <GiftLine />
    </>
  );
}

/** The end of onboarding: the trial as a gift, one quiet line, the date from
    the trial grant (`trialEndsAt`). The mock has no account, so it counts 14
    days from now, after mount (a server date would not match the browser's). */
function GiftLine() {
  const [until, setUntil] = React.useState("");
  React.useEffect(() => {
    setUntil(keepProDate(addCalendarDays(newDate(), 14).toISOString()));
  }, []);
  return (
    <p className="omap-hint omap-gift" data-onboarding-gift="">
      Pro is yours for 14 days{until ? ` · until ${until}` : ""}
    </p>
  );
}

const COPY: Record<number, readonly [string, string]> = {
  1: ["When do you work?", "Pre-filled. You can change it any time."],
  2: ["Where does your work live?", "Needt plans around what is booked."],
  3: ["Connect your AI", "Use Needt from your assistant."],
  4: ["What do you want to do today?", "Needt turns it into a timed plan."],
};

function StepCard({
  n,
  planned,
  onPlan,
  onBack,
  onNext,
  picked,
  onPick,
  aiPicked,
  onAiPick,
}: {
  n: number;
  planned: boolean;
  onPlan: () => void;
  onBack: (() => void) | null;
  onNext: () => void;
  picked: ReadonlySet<string>;
  onPick: (id: string) => void;
  aiPicked: ReadonlySet<string>;
  onAiPick: (id: string) => void;
}) {
  const [title, line] = COPY[n];
  const calendar = ["gcal", "ocal", "ical"].some((id) => picked.has(id));
  return (
    <div className="ac-card omap-card-one" data-omap-step={n}>
      <span className="ac-icon" data-px-calm>
        <NeedtAppIcon size={56} />
      </span>
      <h1 className="ac-title">{title}</h1>
      <p className="auth-signin-text">{line}</p>
      <div className="omap-body">
        {n === 1 ? <Hours /> : null}
        {n === 2 ? (
          <Tiles
            items={WORK_TOOLS}
            picked={picked}
            onPick={onPick}
            label="Calendars and tools"
          />
        ) : null}
        {n === 3 ? (
          <Tiles
            items={AI_TOOLS}
            picked={aiPicked}
            onPick={onAiPick}
            label="AI assistants"
          />
        ) : null}
        {n === 4 ? (
          <Today planned={planned} onPlan={onPlan} noCalendar={!calendar} />
        ) : null}
      </div>
      <div className="omap-nav">
        {onBack ? (
          <button
            type="button"
            className="nx-btn nx-btn-secondary axs-go"
            data-omap-back
            onClick={onBack}
          >
            Back
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="nx-btn nx-btn-primary axs-go"
          data-omap-next
          onClick={onNext}
        >
          {n === 4 ? "Open Today" : "Next"}
        </button>
      </div>
      {n < 4 ? (
        <button
          type="button"
          className="ax-link omap-skip"
          data-omap-skip
          onClick={onNext}
        >
          Skip
        </button>
      ) : null}
    </div>
  );
}

function toSet(v: Iterable<string>): Set<string> {
  return new Set(v);
}

export function OnboardingMap({
  step,
  plan,
}: {
  step?: string;
  plan?: string;
}) {
  const pinned = MAP_STEPS.find((s) => String(s.n) === step)?.n ?? null;
  const [n, setN] = React.useState<number>(pinned ?? 1);
  const [planned, setPlanned] = React.useState(plan === "1");
  const [picked, setPicked] = React.useState<Set<string>>(
    () => new Set(pinned ? ["gcal", "todoist"] : [])
  );
  const [aiPicked, setAiPicked] = React.useState<Set<string>>(
    () => new Set(pinned === 3 ? ["claude"] : [])
  );

  /* The step survives a reload (this browser only: the mock has no account). */
  React.useEffect(() => {
    if (pinned) return;
    try {
      const saved = Number(window.localStorage.getItem(STORE_KEY));
      if (saved >= 1 && saved <= 4) setN(saved);
    } catch {
      /* private window: start at the first step */
    }
  }, [pinned]);
  const go = React.useCallback((to: number) => {
    setN(to);
    try {
      window.localStorage.setItem(STORE_KEY, String(to));
    } catch {
      /* nothing to keep it in */
    }
  }, []);
  const toggle =
    (set: React.Dispatch<React.SetStateAction<Set<string>>>) => (id: string) =>
      set((cur) => {
        const next = toSet(cur);
        if (!next.delete(id)) next.add(id);
        return next;
      });

  return (
    <AuthScope>
      <div className="omap" data-omap={pinned ? "one" : "flow"}>
        <AuthSky variant="b">
          <div
            className="omap-topline"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={1}
            aria-valuemax={4}
            aria-valuenow={n}
          >
            <i style={{ width: `${(n / 4) * 100}%` }} />
          </div>
          <div className="omap-scroll">
            <div className="ac-col omap-col">
              <StepCard
                n={n}
                planned={planned}
                onPlan={() => setPlanned(true)}
                onBack={n > 1 ? () => go(n - 1) : null}
                onNext={() => go(Math.min(4, n + 1))}
                picked={picked}
                onPick={toggle(setPicked)}
                aiPicked={aiPicked}
                onAiPick={toggle(setAiPicked)}
              />
            </div>
          </div>
        </AuthSky>
      </div>
    </AuthScope>
  );
}
