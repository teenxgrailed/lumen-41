import { SubscriptionPlan } from "@prisma/client";
import { z } from "zod";

import { getPlan } from "@/lib/entitlements";
import { logger } from "@/lib/logger";

import { getConfiguredSchedulerAI, getPreparedSchedulerAI } from "./settings";

const LOG_SOURCE = "highlight-suggestions";

/** Candidates read per request, and suggestions given back. */
export const MAX_CANDIDATES = 12;
export const MAX_SUGGESTIONS = 3;
const MAX_REASON = 100;

export const suggestionDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const candidateSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(120),
  due: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  priority: z.string().max(12).nullish(),
  minutes: z.number().int().min(0).max(1440).nullish(),
  /** One of the week's focuses (Sunday review). */
  focus: z.boolean().optional(),
});
export const suggestionCandidatesSchema = z
  .array(candidateSchema)
  .min(1)
  .max(MAX_CANDIDATES);
export type SuggestionCandidate = z.infer<typeof candidateSchema>;

export interface HighlightSuggestion {
  taskId: string;
  reason: string;
}

export type SuggestionOutcome =
  | { status: "ready"; suggestions: HighlightSuggestion[] }
  | { status: "unavailable" | "upgrade"; suggestions: [] };

const SYSTEM = [
  "You choose which task a person should make their highlight, the one main",
  "thing of the day, in their planner.",
  "Pick 2 or 3 of the tasks you are given, best first.",
  "For each, write one plain sentence of at most 14 words saying why it is a",
  "good choice today. Use only the facts you are given; invent nothing.",
  'Tasks marked "week focus" were chosen by the person for this week.',
  'Answer with a JSON array only, no markdown: [{"id":"…","reason":"…"}].',
].join(" ");

/** The candidates as the lines the model reads. */
export function suggestionPrompt(
  date: string,
  candidates: readonly SuggestionCandidate[]
): string {
  const lines = candidates.map((c) => {
    const bits = [
      c.focus ? "week focus" : "",
      c.due ? (c.due < date ? `overdue since ${c.due}` : `due ${c.due}`) : "",
      c.priority && c.priority !== "none" ? `${c.priority} priority` : "",
      c.minutes ? `${c.minutes} min` : "",
    ].filter(Boolean);
    return `- id ${c.id}: ${c.title}${bits.length ? ` (${bits.join(", ")})` : ""}`;
  });
  return `Today is ${date}.\nTasks:\n${lines.join("\n")}`;
}

const oneLine = (s: string) => {
  const t = s
    .replace(/[\r\n]+/g, " ")
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > MAX_REASON ? `${t.slice(0, MAX_REASON - 1).trimEnd()}…` : t;
};

/**
 * The model's answer as suggestions: only ids that were offered, each once,
 * each with a non-empty one-line reason, at most three. Anything else (prose,
 * a broken array, an invented id) is dropped; nothing usable gives [].
 */
export function parseSuggestions(
  raw: string,
  candidates: readonly SuggestionCandidate[]
): HighlightSuggestion[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const known = new Set(candidates.map((c) => c.id));
  const seen = new Set<string>();
  const out: HighlightSuggestion[] = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const { id, reason } = item as { id?: unknown; reason?: unknown };
    if (typeof id !== "string" || typeof reason !== "string") continue;
    const text = oneLine(reason);
    if (!known.has(id) || seen.has(id) || !text) continue;
    seen.add(id);
    out.push({ taskId: id, reason: text });
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}

/**
 * Two or three highlight suggestions with a reason each, through the same
 * hosted (or own-key) AI path as Ask, so the same caps and the monthly action
 * count apply. Pro and Lifetime only; anything that goes wrong is "unavailable"
 * and the screen uses its own order.
 */
export async function suggestHighlights(
  userId: string,
  date: string,
  candidates: readonly SuggestionCandidate[]
): Promise<SuggestionOutcome> {
  if ((await getPlan(userId)) === SubscriptionPlan.FREE) {
    return { status: "upgrade", suggestions: [] };
  }
  const configured = await getConfiguredSchedulerAI(userId);
  if (configured.source === "none") {
    return { status: "unavailable", suggestions: [] };
  }
  try {
    const { ai, source } = await getPreparedSchedulerAI(userId, configured);
    if (source === "none" || !ai.streamChat) {
      return { status: "unavailable", suggestions: [] };
    }
    let raw = "";
    for await (const chunk of ai.streamChat({
      systemPrompt: SYSTEM,
      messages: [{ role: "user", content: suggestionPrompt(date, candidates) }],
    })) {
      raw += chunk;
      if (raw.length > 4000) break;
    }
    const suggestions = parseSuggestions(raw, candidates);
    return suggestions.length
      ? { status: "ready", suggestions }
      : { status: "unavailable", suggestions: [] };
  } catch (error) {
    logger.warn(
      "Highlight suggestions failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return { status: "unavailable", suggestions: [] };
  }
}
