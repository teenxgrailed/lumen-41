import { SubscriptionPlan } from "@prisma/client";
import { z } from "zod";

import { getPlan } from "@/lib/entitlements";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { listMemoriesForUse, rankMemories } from "./memory";
import { getConfiguredSchedulerAI, getPreparedSchedulerAI } from "./settings";

const LOG_SOURCE = "morning-brief";

/** A placeholder older than this is a generation that died; the next run takes over. */
const STALE_MS = 2 * 60 * 1000;
const MAX_CHARS = 220;
const MAX_LINES = 3;

const title = z.string().trim().min(1).max(120);

/**
 * What the screen knows about the person's day, in the person's own zone: it is
 * sent by the client so the brief never guesses a day or a clock on the server.
 */
export const briefFactsSchema = z.object({
  /** Open tasks for today, nearest first. */
  today: z.array(title).max(6),
  openToday: z.number().int().min(0).max(1000),
  doneToday: z.number().int().min(0).max(1000),
  overdue: z.array(title).max(3),
  overdueCount: z.number().int().min(0).max(1000),
  /** Minutes of working time left today; null when unknown or a day off. */
  freeMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .nullable(),
  nextEvent: z
    .object({ title, at: z.string().regex(/^\d{2}:\d{2}$/) })
    .nullable()
    .optional(),
});
export type BriefFacts = z.infer<typeof briefFactsSchema>;

export const briefDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const SYSTEM = [
  "You write a person's morning brief for their planner.",
  "Write at most 2 short sentences, about 200 characters in all.",
  "Start with how many tasks are open today, then the one thing to do first;",
  "mention overdue or free time only if it fits.",
  "Use only the facts you are given; invent nothing. No greeting, no markdown,",
  "no emoji, no list marks, no questions.",
].join(" ");

const hours = (min: number) =>
  min < 60
    ? `${min} min`
    : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ""}`;

/** The facts as the lines the model reads. */
export function briefPrompt(facts: BriefFacts): string {
  const lines = [
    `Open today: ${facts.openToday}; done today: ${facts.doneToday}.`,
    facts.today.length
      ? `Today, nearest first: ${facts.today.join("; ")}.`
      : "",
    facts.overdueCount
      ? `Overdue: ${facts.overdueCount}${facts.overdue.length ? ` (${facts.overdue.join("; ")})` : ""}.`
      : "Nothing is overdue.",
    facts.freeMinutes == null
      ? ""
      : `Free working time left today: ${hours(facts.freeMinutes)}.`,
    facts.nextEvent
      ? `Next event: ${facts.nextEvent.title} at ${facts.nextEvent.at}.`
      : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/** What Ask has learned, as lines for the brief; empty while "Let Needt learn about me" is off. */
export function memoryLines(
  memories: Array<{
    kind: string;
    content: string;
    weight: number;
    id: string;
    lastUsedAt: Date;
  }>
): string {
  const top = rankMemories(memories).slice(0, 8);
  return top.length
    ? `What you know about this person:\n${top.map((m) => `- ${m.content}`).join("\n")}`
    : "";
}

/** The model's text as 2-3 clean lines, or "" when it said nothing usable. */
export function cleanBrief(raw: string): string {
  const lines = raw
    .replace(/\r/g, "")
    .split("\n")
    .map((l) =>
      l
        // list marks only: "1. " or "2) " go, a leading count like "14 tasks" stays
        .replace(/^(?:[\s>*\-•#]+|\d{1,2}[.)]\s+)+/, "")
        .replace(/[*_`]/g, "")
        .trim()
    )
    .filter(Boolean)
    .slice(0, MAX_LINES);
  return capAtSentence(lines.join("\n"), MAX_CHARS);
}

/** Cut at the last sentence end within max; with none, at a word, with an ellipsis. */
export function capAtSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const end = Math.max(
    head.lastIndexOf(". "),
    head.lastIndexOf("! "),
    head.lastIndexOf("? "),
    head.lastIndexOf(".\n"),
    /[.!?]$/.test(head) ? head.length - 1 : -1
  );
  if (end >= 40) return head.slice(0, end + 1).trimEnd();
  const space = head.lastIndexOf(" ");
  return `${head.slice(0, space > 40 ? space : max - 1).trimEnd()}…`;
}

export interface BriefView {
  date: string;
  text: string;
  dismissed: boolean;
}

const view = (row: {
  date: string;
  text: string;
  dismissedAt: Date | null;
}): BriefView | null =>
  row.text
    ? { date: row.date, text: row.text, dismissed: !!row.dismissedAt }
    : null;

/** The cached brief for a day, if one was written. Never generates. */
export async function readBrief(userId: string, date: string) {
  const row = await prisma.morningBrief.findUnique({
    where: { userId_date: { userId, date } },
  });
  return row ? view(row) : null;
}

export type BriefOutcome =
  | { status: "ready"; brief: BriefView }
  | { status: "pending" | "unavailable"; brief: null }
  | { status: "upgrade"; brief: null };

function isUnique(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * The day's brief: the cached one, else one generated now through the same
 * hosted (or own-key) AI path as Ask, with its caps. Pro and Lifetime only.
 * At most one generation per user and day: the first request claims the row,
 * a second finds it (and gets "pending" while the first is still writing).
 */
export async function ensureBrief(
  userId: string,
  date: string,
  facts: BriefFacts,
  workspaceId?: string
): Promise<BriefOutcome> {
  const cached = await prisma.morningBrief.findUnique({
    where: { userId_date: { userId, date } },
  });
  if (cached?.text)
    return { status: "ready", brief: view(cached) as BriefView };

  if ((await getPlan(userId)) === SubscriptionPlan.FREE) {
    return { status: "upgrade", brief: null };
  }
  // AI that cannot answer means no brief, and the day stays unclaimed
  const configured = await getConfiguredSchedulerAI(userId);
  if (configured.source === "none")
    return { status: "unavailable", brief: null };

  if (cached) {
    // someone claimed the day: still writing, or died without writing
    if (Date.now() - cached.updatedAt.getTime() < STALE_MS) {
      return { status: "pending", brief: null };
    }
    await prisma.morningBrief.update({
      where: { id: cached.id },
      data: { updatedAt: new Date() },
    });
  } else {
    try {
      await prisma.morningBrief.create({ data: { userId, date, text: "" } });
    } catch (error) {
      if (isUnique(error)) return { status: "pending", brief: null };
      throw error;
    }
  }

  const release = () =>
    prisma.morningBrief.deleteMany({ where: { userId, date, text: "" } });
  try {
    const { ai, source } = await getPreparedSchedulerAI(userId, configured);
    if (source === "none" || !ai.streamChat) {
      await release();
      return { status: "unavailable", brief: null };
    }
    const known = workspaceId
      ? memoryLines(await listMemoriesForUse(userId, workspaceId))
      : "";
    let raw = "";
    for await (const chunk of ai.streamChat({
      systemPrompt: SYSTEM,
      messages: [
        {
          role: "user",
          content: [briefPrompt(facts), known].filter(Boolean).join("\n\n"),
        },
      ],
    })) {
      raw += chunk;
      if (raw.length > 4000) break;
    }
    const text = cleanBrief(raw);
    if (!text) {
      await release();
      return { status: "unavailable", brief: null };
    }
    const row = await prisma.morningBrief.update({
      where: { userId_date: { userId, date } },
      data: { text },
    });
    return { status: "ready", brief: view(row) as BriefView };
  } catch (error) {
    await release().catch(() => undefined);
    logger.warn(
      "Morning brief failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return { status: "unavailable", brief: null };
  }
}

/** Dismiss the day's brief; it stays cached, so it is never written again. */
export async function dismissBrief(userId: string, date: string) {
  const { count } = await prisma.morningBrief.updateMany({
    where: { userId, date },
    data: { dismissedAt: new Date() },
  });
  return count > 0;
}
