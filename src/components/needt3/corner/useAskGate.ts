"use client";

/* WHY ASK CANNOT ANSWER — the honest state for a person whose hosted AI
 * allowance is nothing (Free) or used up (a paid plan), as opposed to a real
 * provider error. A key or sign-in of their own always answers, so it lifts
 * the gate whatever the plan says.
 */
import { newDate } from "@/lib/date-utils";
import { useOwnAiKey } from "@/lib/needt3/hooks/ai-availability";
import { usePlan } from "@/lib/needt3/hooks/plan";

import { type AiGate, aiGate } from "../states/status";

export function useAskGate(): AiGate | null {
  const plan = usePlan();
  const own = useOwnAiKey();
  return aiGate(plan.data, newDate().getTime(), own.data);
}
