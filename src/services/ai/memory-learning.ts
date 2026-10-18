import { pageActorScope } from "@/services/pages/page-model";
import { AgentMemoryKind, AgentMemorySource } from "@prisma/client";
import { z } from "zod";

import { type WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { normalizeUserTimeZone } from "@/lib/habit-completion-date";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import {
  DURATION_RATIO_KEY,
  isLearningEnabled,
  isSensitiveMemory,
  rememberForUser,
  upsertKeyedMemory,
} from "./memory";
import { getPreparedSchedulerAI } from "./settings";

const LOG_SOURCE = "memory-learning";

/** A learning pass runs at most this often per person. */
export const LEARN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const HABIT_WINDOW_DAYS = 90;
const FOCUS_MINUTES = 25;
const MIN_PEAK_SAMPLES = 8;
const MIN_RATIO_SAMPLES = 5;
const MIN_WEEKDAY_SAMPLES = 10;

export const HABIT_KEYS = {
  peak: "habit:peak-hours",
  ratio: DURATION_RATIO_KEY,
  heavy: "habit:heavy-days",
} as const;

export interface HabitTask {
  completedAt: Date | null;
  actualMinutes: number | null;
  estimatedMinutes: number | null;
  duration: number | null;
}

export interface WorkHabits {
  peak: { startHour: number; endHour: number; samples: number } | null;
  ratio: { ratio: number; samples: number } | null;
  /** ISO weekdays, 1 = Monday. */
  heavyDays: { days: number[]; samples: number } | null;
}

const WEEKDAYS = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * What a person's own finished tasks say about them: the three hours in which
 * they most often finish focused work, how long tasks really take against the
 * estimate, and the weekdays that are heavy. Pure; nothing leaves the database.
 */
export function computeWorkHabits(
  tasks: HabitTask[],
  timeZone: string
): WorkHabits {
  const done = tasks.filter(
    (task): task is HabitTask & { completedAt: Date } => !!task.completedAt
  );

  // Focused work: finished tasks that took (or were planned to take) a while.
  const hours = new Array<number>(24).fill(0);
  let focused = 0;
  for (const task of done) {
    const minutes =
      task.actualMinutes ?? task.estimatedMinutes ?? task.duration;
    if (!minutes || minutes < FOCUS_MINUTES) continue;
    hours[Number(formatInTimeZone(task.completedAt, timeZone, "H"))] += 1;
    focused += 1;
  }
  let peak: WorkHabits["peak"] = null;
  if (focused >= MIN_PEAK_SAMPLES) {
    let best = -1;
    let bestStart = 0;
    for (let start = 0; start <= 21; start += 1) {
      const sum = hours[start] + hours[start + 1] + hours[start + 2];
      if (sum > best) {
        best = sum;
        bestStart = start;
      }
    }
    // A window with under 40% of the finishes is not a habit, just a day.
    if (best / focused >= 0.4) {
      peak = { startHour: bestStart, endHour: bestStart + 3, samples: focused };
    }
  }

  const ratios = done
    .map((task) => {
      const estimate = task.estimatedMinutes ?? task.duration;
      return task.actualMinutes && estimate && estimate > 0
        ? task.actualMinutes / estimate
        : null;
    })
    .filter((value): value is number => value !== null);
  const ratio =
    ratios.length >= MIN_RATIO_SAMPLES
      ? {
          ratio: Math.round(median(ratios) * 100) / 100,
          samples: ratios.length,
        }
      : null;

  const perDay = new Array<number>(8).fill(0);
  for (const task of done) {
    perDay[Number(formatInTimeZone(task.completedAt, timeZone, "i"))] += 1;
  }
  let heavyDays: WorkHabits["heavyDays"] = null;
  if (done.length >= MIN_WEEKDAY_SAMPLES) {
    const mean = done.length / 7;
    const heavy = [1, 2, 3, 4, 5, 6, 7]
      .filter((day) => perDay[day] >= 3 && perDay[day] > mean * 1.4)
      .sort((a, b) => perDay[b] - perDay[a])
      .slice(0, 2)
      .sort((a, b) => a - b);
    if (heavy.length) heavyDays = { days: heavy, samples: done.length };
  }

  return { peak, ratio, heavyDays };
}

const clock = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/** The habit lines as memories, keyed so each pass replaces the last one. */
export function habitMemories(habits: WorkHabits) {
  const lines: Array<{
    sourceKey: string;
    content: string;
    data: Record<string, number | number[]>;
  }> = [];
  if (habits.peak) {
    lines.push({
      sourceKey: HABIT_KEYS.peak,
      content: `Usually finishes focused work between ${clock(habits.peak.startHour)} and ${clock(habits.peak.endHour)}.`,
      data: { ...habits.peak },
    });
  }
  if (habits.ratio && Math.abs(habits.ratio.ratio - 1) >= 0.1) {
    lines.push({
      sourceKey: HABIT_KEYS.ratio,
      content: `Tasks take about ${habits.ratio.ratio}x the estimate (median of ${habits.ratio.samples} finished tasks).`,
      data: { ...habits.ratio },
    });
  }
  if (habits.heavyDays) {
    const names = habits.heavyDays.days.map((day) => WEEKDAYS[day]);
    lines.push({
      sourceKey: HABIT_KEYS.heavy,
      content: `Heaviest weekdays: ${names.join(" and ")}.`,
      data: { ...habits.heavyDays },
    });
  }
  return lines;
}

/** Work habits from the person's own tasks in one workspace. Needs the switch on. */
export async function refreshHabitMemories(
  userId: string,
  workspaceId: string
) {
  if (!(await isLearningEnabled(userId))) return 0;
  const [settings, tasks] = await Promise.all([
    prisma.userSettings.findUnique({
      where: { userId },
      select: { timeZone: true },
    }),
    prisma.task.findMany({
      where: {
        workspaceId,
        assigneeId: userId,
        status: "completed",
        completedAt: {
          gte: new Date(newDate().getTime() - HABIT_WINDOW_DAYS * 86_400_000),
        },
      },
      select: {
        completedAt: true,
        actualMinutes: true,
        estimatedMinutes: true,
        duration: true,
      },
      take: 1000,
    }),
  ]);
  const habits = computeWorkHabits(
    tasks,
    normalizeUserTimeZone(settings?.timeZone)
  );
  const lines = habitMemories(habits);
  for (const line of lines) {
    await upsertKeyedMemory(userId, workspaceId, {
      sourceKey: line.sourceKey,
      kind: AgentMemoryKind.pattern,
      content: line.content,
      source: AgentMemorySource.habit,
      weight: 0.8,
      data: line.data,
    });
  }
  // A habit that no longer holds is dropped, not left to mislead.
  const kept = lines.map((line) => line.sourceKey);
  await prisma.agentMemory.deleteMany({
    where: {
      userId,
      workspaceId,
      source: AgentMemorySource.habit,
      sourceKey: { in: Object.values(HABIT_KEYS), notIn: kept },
    },
  });
  return lines.length;
}

// ---- documents and mail metadata -------------------------------------------

export const MAX_EXTRACTED_FACTS = 5;
const MAX_PAGES = 8;
const MAX_PAGE_CHARS = 1500;
const MAX_MAIL = 40;
const MAX_PROMPT_CHARS = 9000;
const CONTENT_WINDOW_DAYS = 30;

const factSchema = z.object({
  kind: z.nativeEnum(AgentMemoryKind).catch(AgentMemoryKind.fact),
  from: z.enum(["document", "mail"]).catch("document"),
  content: z.string().trim().min(3).max(200),
});
export type ExtractedFact = z.infer<typeof factSchema>;

const EXTRACT_SYSTEM = [
  "You read excerpts of a person's own documents and the subjects and senders of their email.",
  "Extract at most 5 short, lasting facts about how this person works or what they care about:",
  "recurring commitments, projects, tools, routines, preferences.",
  "Use only what the text says. Skip one-off events, other people's private details,",
  "and anything secret or sensitive (passwords, keys, money, health).",
  'Answer with a JSON array only: [{"kind":"preference|goal|fact|pattern","from":"document|mail","content":"one sentence under 160 characters"}].',
  "Answer [] when nothing qualifies.",
].join(" ");

/** The model's answer as facts; anything unusable, sensitive or repeated is dropped. */
export function parseExtractedFacts(raw: string): ExtractedFact[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const facts: ExtractedFact[] = [];
  for (const item of parsed) {
    const fact = factSchema.safeParse(item);
    if (!fact.success || isSensitiveMemory(fact.data.content)) continue;
    const key = fact.data.content.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push(fact.data);
    if (facts.length >= MAX_EXTRACTED_FACTS) break;
  }
  return facts;
}

function blockText(content: unknown): string {
  if (content && typeof content === "object") {
    const text = (content as { text?: unknown }).text;
    if (typeof text === "string") return text;
  }
  return "";
}

/**
 * What goes to the model: capped excerpts of recently edited documents and the
 * subject and sender of recent mail. Mail bodies and snippets are never read.
 */
export async function buildContentExcerpt(
  userId: string,
  workspace: WorkspaceAccess
) {
  const since = new Date(
    newDate().getTime() - CONTENT_WINDOW_DAYS * 86_400_000
  );
  const [pages, mail] = await Promise.all([
    prisma.page.findMany({
      where: {
        ...pageActorScope({ userId, workspace }),
        trashedAt: null,
        isPrivate: false,
        isSample: false,
        updatedAt: { gte: since },
        OR: [{ parentId: null }, { parent: { isPrivate: false } }],
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_PAGES,
      select: {
        title: true,
        blocks: {
          orderBy: { position: "asc" },
          take: 40,
          select: { content: true },
        },
      },
    }),
    prisma.mailMessage.findMany({
      where: {
        account: { userId },
        trashedAt: null,
        date: { gte: since },
      },
      orderBy: { date: "desc" },
      take: MAX_MAIL,
      select: { subject: true, fromName: true, fromAddress: true },
    }),
  ]);

  const parts: string[] = [];
  if (pages.length) {
    parts.push("DOCUMENTS");
    for (const page of pages) {
      const text = page.blocks
        .map((block) => blockText(block.content))
        .filter(Boolean)
        .join(" ")
        .slice(0, MAX_PAGE_CHARS);
      parts.push(`- ${page.title}: ${text}`);
    }
  }
  if (mail.length) {
    parts.push("EMAIL (subject, sender)");
    for (const message of mail) {
      const sender = message.fromName || message.fromAddress || "unknown";
      parts.push(`- ${message.subject.slice(0, 140)} (${sender})`);
    }
  }
  return parts.length ? parts.join("\n").slice(0, MAX_PROMPT_CHARS) : "";
}

/**
 * One hosted-AI call (counted as one AI action, same caps and slow mode as
 * Ask) that turns recent documents and mail metadata into a few short
 * memories. Returns how many were saved.
 */
export async function extractContentMemories(
  userId: string,
  workspace: WorkspaceAccess
) {
  if (!(await isLearningEnabled(userId))) return 0;
  const excerpt = await buildContentExcerpt(userId, workspace);
  if (!excerpt) return 0;

  const { ai, source } = await getPreparedSchedulerAI(userId);
  if (source === "none" || !ai.streamChat) return 0;

  let raw = "";
  for await (const chunk of ai.streamChat({
    systemPrompt: EXTRACT_SYSTEM,
    messages: [{ role: "user", content: excerpt }],
  })) {
    raw += chunk;
    if (raw.length > 4000) break;
  }
  // The switch can be turned off while the model is thinking.
  if (!(await isLearningEnabled(userId))) return 0;

  const facts = parseExtractedFacts(raw);
  for (const fact of facts) {
    await rememberForUser(userId, workspace.workspaceId, {
      kind: fact.kind,
      content: fact.content,
      source:
        fact.from === "mail"
          ? AgentMemorySource.mail
          : AgentMemorySource.document,
      weight: 0.6,
    });
  }
  return facts.length;
}

/** Takes the daily slot for one column; false when another pass already holds it. */
async function claimSlot(
  userId: string,
  column: "learnedAt" | "learnedContentAt",
  now: Date
) {
  const cutoff = new Date(now.getTime() - LEARN_INTERVAL_MS);
  const { count } = await prisma.userSettings.updateMany({
    where: {
      userId,
      learnAboutMe: true,
      OR: [{ [column]: null }, { [column]: { lt: cutoff } }],
    },
    data: { [column]: now },
  });
  return count > 0;
}

/**
 * The learning pass: work habits now, documents and mail in the background.
 * Does nothing unless the person turned the switch on; at most once a day.
 * Never throws: Ask must not fail because learning did.
 */
export async function runLearning(
  userId: string,
  workspace: WorkspaceAccess,
  options: { background?: boolean } = {}
) {
  try {
    if (!(await isLearningEnabled(userId))) return;
    const now = newDate();
    if (await claimSlot(userId, "learnedAt", now)) {
      await refreshHabitMemories(userId, workspace.workspaceId);
    }
    if (await claimSlot(userId, "learnedContentAt", now)) {
      const extract = extractContentMemories(userId, workspace).catch((error) =>
        logger.warn(
          "Learning from documents and mail failed",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        )
      );
      if (!options.background) await extract;
      else void extract;
    }
  } catch (error) {
    logger.warn(
      "Learning pass failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
  }
}
