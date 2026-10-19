import { z } from "zod";

/**
 * STARTER GAME, the shapes both sides share. Client-safe: zod only, no Prisma
 * client and no server code, so the screens and the API print the same limits.
 *
 * The game shows where a person has fewer than five open tasks (Home,
 * Calendar, Tasks), asks three questions, lets one agent request turn the
 * answers into tiles, and creates what the person sorted in one undoable
 * action.
 */

/** Fewer than this many open tasks and the entry card is shown. */
export const STARTER_OPEN_TASK_LIMIT = 5;
/** "Not now" hides the card for this many days. */
export const STARTER_HIDE_DAYS = 7;
/** The agent is asked for this many tiles (12 to 16). */
export const STARTER_TILES_MIN = 12;
export const STARTER_TILES_MAX = 16;

export const STARTER_GROUPS = ["today", "week", "habit", "project"] as const;
export type StarterGroup = (typeof STARTER_GROUPS)[number];
export const STARTER_KINDS = ["task", "habit", "project"] as const;
export type StarterKind = (typeof STARTER_KINDS)[number];

export const STARTER_SCREENS = ["home", "calendar", "tasks"] as const;
export type StarterScreen = (typeof STARTER_SCREENS)[number];

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** What the person said in the three questions, as the chat collected it. */
export const starterAnswersSchema = z
  .object({
    /** What they spend their days on (the chips of Q1). */
    do: z.string().trim().max(400).default(""),
    /** What is burning this week (Q2, typed or dictated). */
    burn: z.string().trim().max(3000).default(""),
    /** What they want to do regularly (Q3, chips and text). */
    reg: z.string().trim().max(1000).default(""),
  })
  .refine((a) => Boolean(a.do || a.burn || a.reg), {
    message: "Answer at least one question",
  });
export type StarterAnswers = z.infer<typeof starterAnswersSchema>;

/** One tile the agent proposes. */
export const starterItemSchema = z.object({
  title: z.string().trim().min(1).max(120),
  kind: z.enum(STARTER_KINDS),
  suggestedGroup: z.enum(STARTER_GROUPS),
  /** Tasks and habits: how long one go takes. */
  durationMinutes: z.number().int().min(5).max(480).optional(),
  /** Habits: how often in a week (7 is daily). */
  perWeek: z.number().int().min(1).max(7).optional(),
  /** Projects: how far it reaches, in the person's words ("by Fri 23 Oct"). */
  horizon: z.string().trim().min(1).max(40).optional(),
  /** A task or project with a date: the day it is due. */
  dueDay: dayKey.optional(),
  /** Projects: the first small step, which becomes a task in the project. */
  firstStep: z.string().trim().min(1).max(160).optional(),
});
export type StarterItem = z.infer<typeof starterItemSchema>;

/** One extra suggestion per lane, from the same request. */
export type StarterSuggestions = Partial<Record<StarterGroup, StarterItem>>;

export type StarterPlanResult =
  | {
      status: "ready";
      items: StarterItem[];
      suggestions: StarterSuggestions;
    }
  | {
      status: "unavailable" | "upgrade";
      items: [];
      suggestions: Record<string, never>;
    };

/** `GET /api/starter-game`: whether the entry card may show. */
export interface StarterGameStatus {
  /** Hidden until this moment ("Not now"), or null. */
  hiddenUntil: string | null;
  /** "Don't show again". */
  neverShow: boolean;
  /** Either of the two is in force right now. */
  hidden: boolean;
  /** Open tasks in the workspace. */
  openTasks: number;
  /** The card should show: fewer than five open tasks and not hidden. */
  eligible: boolean;
  /** Pro, Lifetime or a trial. Free sees the card with PRO. */
  canPlay: boolean;
}

export const starterHideSchema = z.object({
  hide: z.enum(["7d", "never", "show"]),
});
export type StarterHide = z.infer<typeof starterHideSchema>["hide"];

/** What `starter.create` takes: the sorted tiles as the three kinds of record. */
export const starterCreateSchema = z
  .object({
    tasks: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(160),
            group: z.enum(["today", "week"]),
            estimateMinutes: z.number().int().min(5).max(1440).optional(),
            dueDay: dayKey.optional(),
          })
          .strict()
      )
      .max(40)
      .default([]),
    habits: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(200),
            perWeek: z.number().int().min(1).max(7),
            estimateMinutes: z.number().int().min(5).max(480).optional(),
          })
          .strict()
      )
      .max(20)
      .default([]),
    projects: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(120),
            firstStep: z.string().trim().min(1).max(160).optional(),
            horizon: z.string().trim().min(1).max(40).optional(),
            deadlineDay: dayKey.optional(),
          })
          .strict()
      )
      .max(20)
      .default([]),
  })
  .strict()
  .refine((v) => v.tasks.length + v.habits.length + v.projects.length > 0, {
    message: "Nothing to create",
  });
export type StarterCreateInput = z.infer<typeof starterCreateSchema>;

export interface StarterCreateResult {
  counts: { tasks: number; habits: number; projects: number };
  tasks: Array<{ id: string; title: string; group: "today" | "week" }>;
  habits: Array<{ id: string; title: string }>;
  projects: Array<{ id: string; name: string; firstStepTaskId: string | null }>;
}

/* ── words ────────────────────────────────────────────────────────────── */

/** 45 -> "45 min", 60 -> "1 h", 90 -> "1 h 30". */
export function minutesLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

/** 7 -> "daily", 1 -> "weekly", 3 -> "3× a week". */
export function cadenceLabel(perWeek: number): string {
  if (perWeek >= 7) return "daily";
  if (perWeek <= 1) return "weekly";
  return `${perWeek}× a week`;
}

/** The detail line a tile shows: duration, cadence or horizon. */
export function itemDetail(item: {
  kind: StarterKind;
  durationMinutes?: number;
  perWeek?: number;
  horizon?: string;
}): string {
  if (item.kind === "habit") return cadenceLabel(item.perWeek ?? 7);
  if (item.kind === "project") return item.horizon ?? "ongoing";
  return item.durationMinutes ? minutesLabel(item.durationMinutes) : "30 min";
}
