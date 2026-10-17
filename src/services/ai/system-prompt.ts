import { SUBTASK_GUIDANCE } from "@/services/tasks/subtasks";

import { APP_NAME } from "@/lib/app-config";

import { RankedMemory, rankMemories } from "./memory";

export const DEFAULT_AGENT_PROMPT_BUDGET = 2_400;

function estimatedTokens(value: string) {
  return Math.ceil(value.length / 4);
}

export function assembleAgentSystemPrompt(input: {
  soulPreset: string;
  memories: RankedMemory[];
  scheduleSummary: string;
  tokenBudget?: number;
  /** Set for the tool-calling agent: how to act, answer and cite. */
  agent?: { now: string; timeZone: string };
}) {
  const tone =
    input.soulPreset === "coach"
      ? "Be warm, brief, and ADHD-friendly. Reduce friction and avoid shame."
      : "Be concise, direct, and businesslike.";
  const base = [
    `You are ${APP_NAME}'s private planner assistant for the currently authenticated user.`,
    tone,
    "Use tools for planner data. Never claim a mutation unless its server result confirms it.",
    "Updates and deletes require explicit confirmation when the tool catalog marks them dangerous.",
    "Durable preferences may be remembered silently when useful. Never remember credentials, financial data, health data, message bodies, or other sensitive personal data.",
    "Mail access is read-only: never send, reply to, forward, archive, or delete mail.",
    `Tasks can have subtasks. ${SUBTASK_GUIDANCE} Tick subtasks with complete_subtask; once the last one is done the task itself is the final step, so offer to close it.`,
  ].join(" ");
  const agentRules = input.agent
    ? [
        `Now: ${input.agent.now} (${input.agent.timeZone}). Resolve "today", "tomorrow" and weekdays against it, and pass dates as YYYY-MM-DD or ISO.`,
        "Reply in one to three short sentences. No preamble, no recap of the request.",
        "Look before you act: search or list first, and use ids from tool results, never guessed ones. Fetch details only for what you need.",
        "After acting, say in one line what changed; the app shows Undo. Never claim a change the tool result does not confirm.",
        "When you mention a task, event, page, habit or message from a tool result, link it as [title](href) using the href the tool returned.",
        "Deleting asks the person first; just call the tool and the app asks.",
      ].join(" ")
    : "";
  const budget = Math.max(
    400,
    input.tokenBudget ?? DEFAULT_AGENT_PROMPT_BUDGET
  );
  const parts = [base];
  let used = estimatedTokens(base);
  if (agentRules) {
    parts.push(agentRules);
    used += estimatedTokens(agentRules);
  }
  const usedMemoryIds: string[] = [];

  if (input.scheduleSummary) {
    const schedule = `Today's schedule: ${input.scheduleSummary}`;
    if (used + estimatedTokens(schedule) <= budget) {
      parts.push(schedule);
      used += estimatedTokens(schedule);
    }
  }

  for (const memory of rankMemories(input.memories)) {
    const line = `Memory (${memory.kind}): ${memory.content}`;
    if (used + estimatedTokens(line) > budget) continue;
    parts.push(line);
    usedMemoryIds.push(memory.id);
    used += estimatedTokens(line);
  }

  return { prompt: parts.join("\n"), usedMemoryIds, estimatedTokens: used };
}
