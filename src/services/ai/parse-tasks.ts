import { logger } from "@/lib/logger";

import { parseTasksFallback } from "./fallback-parser";
import { getConfiguredSchedulerAI, getPreparedSchedulerAI } from "./settings";
import {
  HOSTED_AI_BUSY_MESSAGE,
  HOSTED_AI_RESTING_MESSAGE,
  HostedAiQueueError,
} from "./slow-queue";
import type { ParsedTask } from "./types";

const LOG_SOURCE = "parse-tasks-service";

export interface ParseTasksResult {
  tasks: ParsedTask[];
  /** True when the deterministic fallback parser ran instead of the AI. */
  fallback: boolean;
  notice?: string;
}

/**
 * Turns free text into task drafts for one person: the AI when it is on and
 * has quota, the deterministic fallback parser otherwise. Shared by
 * `POST /api/ai/parse-tasks` and the day plan (the evening note), so both fall
 * back the same way. It never throws on an AI failure.
 */
export async function parseTasksForUser(
  userId: string,
  text: string
): Promise<ParseTasksResult> {
  const configured = await getConfiguredSchedulerAI(userId);
  const { settings } = configured;

  if (!settings.allowParseTasks || !text.trim()) {
    return { tasks: parseTasksFallback(text), fallback: true };
  }

  try {
    const { ai, source, usage, hostedMode } = await getPreparedSchedulerAI(
      userId,
      configured
    );
    if (source === "none") {
      return {
        tasks: parseTasksFallback(text),
        fallback: true,
        notice: usage.exhausted ? HOSTED_AI_RESTING_MESSAGE : undefined,
      };
    }
    const tasks = await ai.parseTasks(text);
    return {
      tasks,
      fallback: false,
      notice: hostedMode === "slow" ? HOSTED_AI_BUSY_MESSAGE : undefined,
    };
  } catch (error) {
    logger.warn(
      "AI parse failed, falling back",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return {
      tasks: parseTasksFallback(text),
      fallback: true,
      notice:
        error instanceof HostedAiQueueError ? HOSTED_AI_BUSY_MESSAGE : undefined,
    };
  }
}
