/* WHY /api/ai/chat SAID NO — told apart from a provider that did not answer.
 *
 * The route refuses before it calls any provider when the person has no hosted
 * AI (`UPGRADE_REQUIRED`, 403), has used the allowance (`HOSTED_LIMIT_REACHED`,
 * 409), or nothing is configured (`AI_UNAVAILABLE`, 409). None of those is
 * "I could not reach the AI provider": that line is only for a request that
 * went out and failed.
 */
export const REACH_FAILED = "I could not reach the AI provider. Try again.";

export interface Refusal {
  text: string;
  /** The plan has no hosted AI (Free). */
  upgrade: boolean;
  /** The hosted allowance is used up. */
  allowance: boolean;
  /** A refusal from the plan or the allowance: the panel should lock. */
  gated: boolean;
}

export function refusalFor(
  status: number,
  body: { error?: unknown; code?: unknown; upgradeRequired?: unknown } | null
): Refusal {
  const code = typeof body?.code === "string" ? body.code : "";
  const upgrade = body?.upgradeRequired === true || code === "UPGRADE_REQUIRED";
  const allowance = code === "HOSTED_LIMIT_REACHED";
  const named = typeof body?.error === "string" ? body.error : "";
  let text = named;
  if (!text) {
    if (upgrade) text = "AI is part of Pro.";
    else if (status === 403) text = "Ask Needt is not available here.";
    else if (allowance) text = "Your AI allowance is used up for this month.";
    else if (status === 409) text = "AI is not available right now.";
    else text = REACH_FAILED;
  }
  return { text, upgrade, allowance, gated: upgrade || allowance };
}
