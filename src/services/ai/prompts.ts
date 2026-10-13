import { SchedulingContext } from "./types";

export function schedulePrompt(input: SchedulingContext): string {
  return JSON.stringify({
    instruction:
      "Return strict JSON only. Suggest transparent schedule adjustments. Do not invent task ids. Keep the deterministic schedule as the baseline.",
    schema: {
      summary: "string",
      moves: [
        {
          taskId: "string",
          fromStart: "ISO string or null",
          fromEnd: "ISO string or null",
          toStart: "ISO string",
          toEnd: "ISO string",
          reason: "string",
        },
      ],
      reorderedTaskIds: ["task id strings"],
      energyTags: [
        {
          taskId: "string",
          energyRequired: "LOW|MEDIUM|HIGH",
          reason: "string",
        },
      ],
      estimateAdjustments: [
        {
          taskId: "string",
          estimatedMinutes: "number",
          reason: "string",
        },
      ],
      warnings: ["string"],
    },
    input,
  });
}

export function parsePrompt(text: string): string {
  return JSON.stringify({
    instruction:
      "Return strict JSON only. Convert this brain dump into an array of structured tasks. A task that needs more than one step gets `entry` (the very first small step, about two minutes) and `subtasks` (short concrete steps in the order they are done); its title is the closing step, finished last. Do not split one job into several top-level tasks when its parts are steps of the same outcome.",
    schema: [
      {
        title: "string",
        description: "optional string",
        estimatedMinutes: "optional number",
        minChunkMinutes: "optional number",
        maxChunkMinutes: "optional number",
        deadline: "optional ISO string",
        priority: "LOW|MEDIUM|HIGH|URGENT",
        energyRequired: "LOW|MEDIUM|HIGH",
        contextTag: "optional string",
        entry: "optional string, the first small step",
        subtasks: "optional array of strings, in the order they are done",
      },
    ],
    text,
  });
}
