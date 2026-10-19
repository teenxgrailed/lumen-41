import {
  getConfiguredSchedulerAI,
  getPreparedSchedulerAI,
} from "@/services/ai/settings";
import { userTimeZone } from "@/services/ops/helpers";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { canUseAiAgent } from "@/lib/entitlements";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  STARTER_GROUPS,
  STARTER_TILES_MAX,
  STARTER_TILES_MIN,
  type StarterAnswers,
  type StarterGroup,
  type StarterItem,
  type StarterPlanResult,
  type StarterSuggestions,
  starterItemSchema,
} from "@/lib/starter-game";

const LOG_SOURCE = "starter-game-agent";

/** A reply longer than this is a runaway; the stream is cut. */
const MAX_REPLY_CHARS = 24_000;
/** Fewer usable tiles than this is not a board worth sorting. */
const MIN_USABLE = 4;

const SYSTEM = [
  "You turn what a person says about their life and week into tiles they sort in a planner.",
  `Reply with ONE JSON object and nothing else: {"items":[...],"suggestions":{...}}.`,
  `"items" has ${STARTER_TILES_MIN} to ${STARTER_TILES_MAX} entries, each`,
  `{"title","kind","suggestedGroup","durationMinutes","perWeek","horizon","dueDay","firstStep"}.`,
  `kind is "task", "habit" or "project". suggestedGroup is "today", "week", "habit" or "project":`,
  `a task goes to "today" (can be done today) or "week"; a habit to "habit"; a project to "project".`,
  `A task has durationMinutes (5 to 480; 15, 30, 45, 60 or 90 are typical) and may have dueDay (YYYY-MM-DD, within the next 7 days).`,
  `A habit has perWeek (1 to 7; 7 is daily) and durationMinutes.`,
  `A project is bigger than one sitting. It has horizon (a few words: "by Fri 23 Oct", "this quarter", "ongoing")`,
  `and ALWAYS a firstStep: one small concrete action that starts it. Give every task a firstStep too (a person may turn it into a project); habits need none.`,
  `Titles are short, concrete, start with a verb where it fits, 60 characters at most.`,
  `Use only what the person said or what follows plainly from it; invent no people, dates or facts.`,
  `Mix the kinds: most items are tasks, then habits from what they want to do regularly, then projects for what is bigger.`,
  `"suggestions" has up to one extra item per lane, keyed "today", "week", "habit", "project", same fields,`,
  `each a sensible addition that is NOT already in "items".`,
  `Write titles in the language the person wrote in. No markdown, no commentary outside the JSON.`,
].join(" ");

/** The answers and the day, as the one user message. */
export function starterPrompt(input: {
  answers: StarterAnswers;
  today: string;
  weekday: string;
  timeZone: string;
}): string {
  const { answers } = input;
  return [
    `Today is ${input.weekday} ${input.today} (time zone ${input.timeZone}).`,
    `What the person spends their days on: ${answers.do || "(not said)"}`,
    `What is burning this week: ${answers.burn || "(not said)"}`,
    `What they want to do regularly: ${answers.reg || "(not said)"}`,
  ].join("\n");
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function asNumber(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n)
    ? Math.round(n)
    : undefined;
}
function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * One tile from the model's loose JSON, or null when it is not usable. Fields
 * that do not fit are dropped, not the whole tile.
 */
export function cleanItem(raw: unknown): StarterItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = asText(r.title);
  const group = STARTER_GROUPS.find((g) => g === r.suggestedGroup);
  if (!title || !group) return null;
  // The kind follows the lane: a habit lane is a habit, a project lane a project.
  const kind =
    group === "habit" ? "habit" : group === "project" ? "project" : "task";
  const candidate: Record<string, unknown> = {
    title: title.slice(0, 120),
    kind,
    suggestedGroup: group,
    durationMinutes: asNumber(r.durationMinutes),
    perWeek: asNumber(r.perWeek),
    horizon: asText(r.horizon)?.slice(0, 40),
    dueDay:
      typeof r.dueDay === "string" && DAY_KEY.test(r.dueDay)
        ? r.dueDay
        : undefined,
    firstStep: asText(r.firstStep)?.slice(0, 160),
  };
  for (const key of Object.keys(candidate)) {
    if (candidate[key] === undefined) delete candidate[key];
  }
  let parsed = starterItemSchema.safeParse(candidate);
  if (!parsed.success) {
    // Drop the optional fields that failed and keep the tile.
    const bad = new Set(
      parsed.error.issues.map((issue) => String(issue.path[0]))
    );
    for (const key of bad) if (key !== "title") delete candidate[key];
    parsed = starterItemSchema.safeParse(candidate);
  }
  if (!parsed.success) return null;
  const item = parsed.data;
  if (item.kind === "project" && !item.firstStep) {
    // A project always starts with a step; without one it is just a task.
    return { ...item, kind: "task", suggestedGroup: "week" };
  }
  return item;
}

/** The first balanced JSON object in a reply (it may sit in a code fence). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** The model's reply as tiles and per-lane suggestions; null when unusable. */
export function parseStarterReply(
  text: string
): { items: StarterItem[]; suggestions: StarterSuggestions } | null {
  const json = extractJson(text) as {
    items?: unknown;
    suggestions?: unknown;
  } | null;
  if (!json || !Array.isArray(json.items)) return null;

  const seen = new Set<string>();
  const items: StarterItem[] = [];
  for (const raw of json.items) {
    const item = cleanItem(raw);
    if (!item) continue;
    const key = item.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
    if (items.length >= STARTER_TILES_MAX) break;
  }
  if (items.length < MIN_USABLE) return null;

  const suggestions: StarterSuggestions = {};
  const rawSug = json.suggestions;
  if (rawSug && typeof rawSug === "object") {
    for (const group of STARTER_GROUPS) {
      const raw = (rawSug as Record<string, unknown>)[group];
      if (!raw || typeof raw !== "object") continue;
      const item = cleanItem({ ...(raw as object), suggestedGroup: group });
      // The lane decides the kind, and an extra must not repeat a tile.
      if (item && !seen.has(item.title.toLowerCase())) {
        suggestions[group as StarterGroup] = item;
      }
    }
  }
  return { items, suggestions };
}

/**
 * THE ONE AGENT REQUEST of the Starter game, made after the third answer. One
 * hosted (or own-key) AI call through the same path and caps as Ask: it
 * counts as one action. The tiles and the per-lane suggestions come back
 * together, so nothing after this asks the model again. Pro, Lifetime and
 * trial only. When no AI can answer the status is "unavailable" and nothing
 * is made up.
 */
export async function makeStarterPlan(input: {
  userId: string;
  answers: StarterAnswers;
}): Promise<StarterPlanResult> {
  const none = (status: "unavailable" | "upgrade") =>
    ({ status, items: [], suggestions: {} }) as StarterPlanResult;

  if (!(await canUseAiAgent(input.userId)).allowed) return none("upgrade");

  const configured = await getConfiguredSchedulerAI(input.userId);
  if (configured.source === "none") return none("unavailable");

  try {
    const { ai, source } = await getPreparedSchedulerAI(
      input.userId,
      configured
    );
    if (source === "none" || !ai.streamChat) return none("unavailable");

    const timeZone = await userTimeZone(prisma, input.userId);
    const now = newDate();
    let raw = "";
    for await (const chunk of ai.streamChat({
      systemPrompt: SYSTEM,
      messages: [
        {
          role: "user",
          content: starterPrompt({
            answers: input.answers,
            today: formatInTimeZone(now, timeZone, "yyyy-MM-dd"),
            weekday: formatInTimeZone(now, timeZone, "EEEE"),
            timeZone,
          }),
        },
      ],
    })) {
      raw += chunk;
      if (raw.length > MAX_REPLY_CHARS) break;
    }

    const reply = parseStarterReply(raw);
    if (!reply) {
      logger.warn("Starter game reply was not usable", {}, LOG_SOURCE);
      return none("unavailable");
    }
    return { status: "ready", ...reply };
  } catch (error) {
    logger.warn(
      "Starter game request failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return none("unavailable");
  }
}
