/**
 * Which AI answers a request: Needt's own ("needt", today's behaviour: the
 * person's key or the hosted one, metered in actions) or the person's own
 * ChatGPT plan ("chatgpt_plan"). One request param, `provider`, selects it;
 * the Chat provider chip sends the same value.
 */
export const AI_PROVIDER_CHOICES = ["needt", "chatgpt_plan"] as const;
export type AiProviderChoice = (typeof AI_PROVIDER_CHOICES)[number];

/** Anything but the exact string "chatgpt_plan" is Needt's AI. */
export function parseAiProviderChoice(value: unknown): AiProviderChoice {
  return value === "chatgpt_plan" ? "chatgpt_plan" : "needt";
}

/** Why the person's plan did not answer. */
export type ChatGptPlanFallbackReason =
  | "not_connected"
  | "revoked"
  | "limit"
  | "ineligible"
  | "auth"
  | "unavailable";

/**
 * What the response says about who answered. Present only when the request
 * asked for `chatgpt_plan` and the feature is available; absent otherwise, so
 * a deployment with the feature off shows no trace of it.
 *
 * `fallback.charged` is the honesty bit: true means Needt AI answered and the
 * request counted against the person's metered Needt AI actions (hosted
 * quota). False means it ran on their own provider key at no cost to the cap.
 */
export interface AiProviderReport {
  requested: AiProviderChoice;
  used: AiProviderChoice | "none";
  fallback: null | {
    reason: ChatGptPlanFallbackReason;
    charged: boolean;
  };
  /** Set when nothing answered and the person has something to do about it. */
  state?:
    | "plan_limit_reached"
    | "reconnect_required"
    | "plan_ineligible"
    | "plan_unavailable";
  manageUsageUrl?: string;
}
