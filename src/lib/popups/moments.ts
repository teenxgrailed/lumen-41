import { keepProItems } from "@/lib/needt3/paywall";
import { PLAN_LIMITS } from "@/lib/plan-limits";

import {
  POPUP_LIMITS,
  type PopupCandidate,
  type PopupLimit,
  type PopupPlan,
  type PopupPlanCard,
  type PopupView,
  momentId,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long after a trial ends the "trial ended" popup can still appear. */
export const TRIAL_ENDED_WINDOW_MS = 7 * DAY_MS;

/**
 * The two ways out of a limit: Pro, and Lifetime. Prices are not here: the
 * host prints them from the one pricing module (`priceStrings`), and drops
 * the Lifetime card when no seats are left.
 */
const CARDS: PopupPlanCard[] = [
  { plan: "pro", pick: "annual" },
  { plan: "lifetime", pick: "lifetime" },
];

export function isPopupLimit(value: unknown): value is PopupLimit {
  return (
    typeof value === "string" &&
    (POPUP_LIMITS as readonly string[]).includes(value)
  );
}

const plural = (n: number, one: string, many: string) =>
  n === 1 ? `${n} ${one}` : `${n} ${many}`;

/** The words for one limit, with the numbers read from the plan table the server enforces. */
function limitCopy(limit: PopupLimit): {
  title: string;
  body: string;
  feature: string;
} {
  const free = PLAN_LIMITS.FREE;
  switch (limit) {
    case "habits":
      return {
        title: "Need more habits?",
        body: `Free keeps ${plural(free.habits, "active habit", "active habits")}. Pro and Lifetime have no limit.`,
        feature: "Habits",
      };
    case "ai":
      return {
        title: "Need Ask Needt?",
        body: "AI (Plan my day and Ask Needt) is part of Pro and Lifetime.",
        feature: "Ask Needt",
      };
    case "boards":
      return {
        title: "Need more boards?",
        body: `Free keeps ${plural(free.boards, "board", "boards")}. Pro and Lifetime have no limit.`,
        feature: "Boards",
      };
    case "calendars":
      return {
        title: "Need more calendars?",
        body: `Free connects ${plural(free.calendars, "calendar", "calendars")}. Pro and Lifetime have no limit.`,
        feature: "Calendars",
      };
    case "auto_schedule":
      return {
        title: "Need more scheduling?",
        body: `Free auto-schedules ${free.autoScheduledTasks} tasks. Pro and Lifetime have no limit.`,
        feature: "Auto-scheduling",
      };
  }
}

function baseView(
  source: "limit" | "trial",
  key: string,
  rest: Pick<PopupView, "kind" | "badge" | "title" | "body" | "feature"> &
    Partial<Pick<PopupView, "bullets">>
): PopupView {
  return {
    id: momentId(source, key),
    source,
    key,
    imageUrl: null,
    primary: null,
    secondary: "Not now",
    cards: CARDS,
    bullets: [],
    ...rest,
  };
}

/** The "Need more?" popup for a limit the person just hit. Only a Free account gets one. */
export function limitMoment(
  limit: PopupLimit,
  plan: PopupPlan
): PopupCandidate | null {
  if (plan !== "FREE") return null;
  const copy = limitCopy(limit);
  const key = `limit:${limit}`;
  return {
    source: "limit",
    key,
    priority: 0,
    view: baseView("limit", key, {
      kind: "limit",
      badge: "Free plan",
      title: copy.title,
      body: copy.body,
      feature: copy.feature,
    }),
  };
}

export type TrialMomentKey = "trial:3d" | "trial:1d" | "trial:ended";

/**
 * Where a trial stands: "trial:3d" in the last three days, "trial:1d" in the
 * last day, "trial:ended" for a week after it lapsed into Free. Null any
 * other time, and for anyone who paid (a paid plan is not a trial that ended).
 */
export function trialMomentKey(
  plan: PopupPlan,
  trialEndsAt: Date | null,
  now: Date
): TrialMomentKey | null {
  if (!trialEndsAt) return null;
  const left = trialEndsAt.getTime() - now.getTime();
  if (plan === "TRIAL" && left > 0) {
    if (left <= DAY_MS) return "trial:1d";
    if (left <= 3 * DAY_MS) return "trial:3d";
    return null;
  }
  if (plan === "FREE" && left <= 0 && -left <= TRIAL_ENDED_WINDOW_MS) {
    return "trial:ended";
  }
  return null;
}

const TRIAL_COPY: Record<
  TrialMomentKey,
  { title: string; body: string; badge: string }
> = {
  "trial:3d": {
    badge: "Trial",
    title: "Your trial ends in 3 days",
    body: "Keep Pro to keep everything below. Otherwise your account goes back to Free.",
  },
  "trial:1d": {
    badge: "Trial",
    title: "Your trial ends tomorrow",
    body: "Keep Pro to keep everything below. Otherwise your account goes back to Free.",
  },
  "trial:ended": {
    badge: "Trial ended",
    title: "Your trial has ended",
    body: "You are on Free now. Pro brings back everything below.",
  },
};

export function trialMoment(key: TrialMomentKey): PopupCandidate {
  const copy = TRIAL_COPY[key];
  return {
    source: "trial",
    key,
    priority: 0,
    view: baseView("trial", key, {
      kind: "trial",
      badge: copy.badge,
      title: copy.title,
      body: copy.body,
      feature: null,
      bullets: keepProItems()
        .slice(0, 4)
        .map((text) => ({ icon: "check" as const, text })),
    }),
  };
}

/** The trial popup that applies now, as a candidate list of zero or one. */
export function trialMoments(
  plan: PopupPlan,
  trialEndsAt: Date | null,
  now: Date
): PopupCandidate[] {
  const key = trialMomentKey(plan, trialEndsAt, now);
  return key ? [trialMoment(key)] : [];
}
