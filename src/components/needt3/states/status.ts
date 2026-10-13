import { newDate } from "@/lib/date-utils";
import type { V3Plan } from "@/lib/needt3/hooks/plan";

import strings from "../../../../docs/port/prototype/port/strings/en.json";
import type { SkeletonKind } from "./StSkeleton";

const specCopy = strings["states.jsx"].stBannerSpecs;
const errorCopy = strings["states.jsx"].stErrorText;

export interface ScreenQuery {
  status: "pending" | "error" | "success";
  fetchStatus: "fetching" | "paused" | "idle";
  data: unknown;
  error: unknown;
  refetch: () => unknown;
}

export type ScreenState =
  | "content"
  | "loading"
  | "error"
  | "offline"
  | "no-access";

export function screenState(query: ScreenQuery): ScreenState {
  const status =
    query.error && typeof query.error === "object" && "status" in query.error
      ? query.error.status
      : undefined;
  // Lost permission must hide even a previously cached response.
  if (query.status === "error" && status === 403) return "no-access";
  if (query.data !== undefined) return "content";
  if (query.fetchStatus === "paused") return "offline";
  if (query.status === "pending") return "loading";
  if (query.status === "error") return "error";
  return "content";
}

/** Screen name → skeleton kind (states.jsx `ST_KIND`). */
export const SCREEN_KIND: Record<string, SkeletonKind> = {
  today: "list",
  tasks: "list",
  projects: "list",
  mail: "list",
  habits: "list",
  trash: "list",
  settings: "list",
  docs: "grid",
  templates: "grid",
  shared: "grid",
  moodboards: "grid",
  calendar: "calendar",
  doc: "doc",
  connections: "cards",
  chat: "chat",
};

const SCREEN_WHAT: Record<string, string> = {
  today: "your day",
  tasks: "your tasks",
  projects: "your projects",
  calendar: "your calendar",
  docs: "your documents",
  doc: "this document",
  mail: "your mail",
  moodboards: "your moodboards",
  habits: "your habits",
  templates: "templates",
  shared: "what's shared with you",
  trash: "Trash",
  connections: "your connections",
  settings: "your settings",
  chat: "this conversation",
};

/** states.jsx `stErrorText`. */
export function errorText(screen?: string) {
  if (screen === "calendar")
    return errorCopy.couldnt_load_your_calendar_google_calend;
  if (screen === "mail")
    return errorCopy.couldnt_load_your_mail_gmail_didnt_answe;
  return `Couldn't load ${(screen && SCREEN_WHAT[screen]) || "this"} — the server didn't answer.`;
}

export type AccountState =
  | "none"
  | "payment-failed"
  | "trial-ending"
  | "trial-ended";

export function accountState(
  plan: V3Plan | undefined,
  now: number
): AccountState {
  if (!plan) return "none";
  if (plan.paymentFailed) return "payment-failed";
  if (
    plan.kind === "trial" &&
    plan.trialDaysLeft !== null &&
    plan.trialDaysLeft <= 3
  )
    return "trial-ending";
  // A free account with a retained trial grant in the past: the trial ended.
  // A free account that never had a trial has `trialEndsAt: null`.
  if (
    plan.kind === "free" &&
    plan.trialEndsAt &&
    newDate(plan.trialEndsAt).getTime() <= now
  )
    return "trial-ended";
  return "none";
}

/**
 * `GET /api/billing` returns `usage.aiActions` ({ plan, allowed, slowMode,
 * exhausted }) though `V3Plan` does not type it yet; read it defensively.
 */
export function aiExhausted(plan: V3Plan | undefined) {
  const usage = (plan as { usage?: unknown } | undefined)?.usage;
  if (!usage || typeof usage !== "object" || !("aiActions" in usage))
    return false;
  const ai = usage.aiActions;
  return Boolean(
    ai && typeof ai === "object" && "exhausted" in ai && ai.exhausted === true
  );
}

export type BannerIcon = "card" | "clock" | "lock" | "sparkles";
export type BannerAction = "update-payment" | "see-plans" | "upgrade";

export interface BannerSpec {
  id: "payment" | "ai" | "trial";
  tone: "neutral" | "attention";
  icon: BannerIcon;
  title: string;
  body?: string;
  action?: { kind: BannerAction; label: string };
}

/**
 * states.jsx `stBannerSpecs`, limited to the states that have real data.
 * Order follows the prototype: payment, (revoked), (conflict), AI, trial.
 */
export function bannerSpecs(
  plan: V3Plan | undefined,
  screen: string | undefined,
  now: number
): BannerSpec[] {
  const out: BannerSpec[] = [];
  const account = accountState(plan, now);
  if (account === "payment-failed")
    // //todo the prototype body names the failed charge date and the grace
    // period ("The charge on 5 Oct didn't go through…"); /api/billing has
    // neither, so the body is left out instead of inventing dates.
    out.push({
      id: "payment",
      tone: "attention",
      icon: "card",
      title: specCopy.payment_failed_update_your_card_to_keep_,
      action: { kind: "update-payment", label: specCopy.update_payment },
    });
  // //todo "Google Calendar/Gmail access was revoked" banner: needs a
  // connection-health source in the v3 hooks (S1); not rendered until then.
  // //todo doc conflict banner: needs a revision-conflict source (T14).
  if (screen === "today" && aiExhausted(plan))
    // //todo the prototype says "AI paused until 14:00"; no reset time is
    // exposed yet, so the title drops it rather than inventing one.
    out.push({
      id: "ai",
      tone: "neutral",
      icon: "clock",
      title: "AI paused — your tasks and calendar still work",
    });
  // //todo AI provider-down banner ("AI is temporarily unavailable"): no
  // service-health source exists; never infer it from a billing error.
  if (account === "trial-ended")
    out.push({
      id: "trial",
      tone: "neutral",
      icon: "lock",
      title: specCopy.trial_ended_ai_planning_and_themes_are_n,
      body: specCopy.everything_you_made_stays_yours_and_edit,
      action: { kind: "see-plans", label: specCopy.see_plans },
    });
  if (account === "trial-ending" && plan?.trialDaysLeft != null) {
    const days = plan.trialDaysLeft;
    out.push({
      id: "trial",
      tone: "neutral",
      icon: "sparkles",
      title:
        days === 0
          ? "Pro trial ends today"
          : `Pro trial ends in ${days} ${days === 1 ? "day" : "days"}`,
      action: { kind: "upgrade", label: specCopy.upgrade },
    });
  }
  return out;
}

/** states.jsx `stLockRules`: selector → why the control is locked. */
export function lockRules(
  plan: V3Plan | undefined,
  now: number
): Array<[string, string]> {
  if (accountState(plan, now) === "trial-ended")
    return [
      [
        "[data-agent-plan]",
        "Pro · AI planning is read-only since your trial ended",
      ],
      [
        "[data-dc-style] button",
        "Pro · Document themes are read-only since your trial ended",
      ],
      [
        "[data-cn-connect]",
        "Pro · Extra connections need Pro since your trial ended",
      ],
    ];
  if (aiExhausted(plan))
    return [
      ["[data-agent-plan]", "AI paused — your tasks and calendar still work"],
    ];
  return [];
}

/**
 * The queued-change count in a `NEEDT_OFFLINE_STATE` service-worker message,
 * or `undefined` when the message is not for this tab. `scopeKey: null`
 * applies to every scope (sign-out reset); any other scope is ignored.
 */
export function offlineCount(data: unknown, scopeKey: string | null) {
  if (!data || typeof data !== "object") return undefined;
  const message = data as {
    type?: unknown;
    scopeKey?: unknown;
    count?: unknown;
  };
  if (message.type !== "NEEDT_OFFLINE_STATE") return undefined;
  if (message.scopeKey !== null && (!scopeKey || message.scopeKey !== scopeKey))
    return undefined;
  const count = Number(message.count);
  return Number.isSafeInteger(count) && count >= 0 ? count : undefined;
}
