import { z } from "zod";

import { AREAS, CATALOG_TASKS, RITUALS } from "./catalog";

/**
 * The answers behind the first week, exactly as the 18-screen onboarding
 * collects them. One shape for the browser draft, the preview endpoint, the
 * saved copy in `UserSettings.onboarding` and the commit: nothing here is UI
 * state that only our own screens can see.
 *
 * Days are Monday-first (0 = Monday ... 6 = Sunday), as the design draws them.
 * Hours are decimal hours in half-hour steps (9.5 = 09:30).
 */

const AREA_IDS = AREAS.map((a) => a.id);
const TASK_IDS = new Set(CATALOG_TASKS.map((t) => t.id));
const RITUAL_IDS = new Set(RITUALS.map((r) => r.id));

export const FOCUS_PARTS = ["m", "a", "e"] as const;
export const MAX_BLOCKS = [45, 60, 90, 120] as const;
export const BUFFERS = [0, 10, 15, 30] as const;
export const CALENDAR_LINKS = ["google", "icloud", "outlook"] as const;
export const REMINDER_MODES = ["5", "0", "brief"] as const;

const hour = z
  .number()
  .min(0)
  .max(24)
  .refine((n) => Number.isInteger(n * 2), "Half-hour steps only");

const ownTask = z.object({
  id: z.string().min(1).max(40),
  area: z.enum(AREA_IDS as [string, ...string[]]),
  title: z.string().trim().min(1).max(120),
  minutes: z.number().int().min(5).max(240),
  rep: z.number().int().min(0).max(7),
});

export const onboardingAnswersSchema = z.object({
  name: z.string().trim().max(30).default(""),
  areas: z
    .array(z.enum(AREA_IDS as [string, ...string[]]))
    .max(AREA_IDS.length)
    .default([]),
  /** Picked suggestions from the catalog. */
  picks: z
    .array(z.string().refine((id) => TASK_IDS.has(id), "Unknown task"))
    .max(80)
    .default([]),
  /** Tasks the person typed ("Call the landlord 15 min", "3×"). */
  own: z.array(ownTask).max(40).default([]),
  /** Times a week per task id, overriding the suggestion. 0 = off. */
  reps: z.record(z.string(), z.number().int().min(0).max(7)).default({}),
  rituals: z
    .array(z.string().refine((id) => RITUAL_IDS.has(id), "Unknown ritual"))
    .max(RITUALS.length)
    .default([]),
  /** Areas in the order the person tapped them. */
  rank: z.array(z.enum(AREA_IDS as [string, ...string[]])).default([]),
  workdays: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .default([0, 1, 2, 3, 4]),
  weekends: z.boolean().default(true),
  hours: z.object({ start: hour, end: hour }).default({ start: 9, end: 18 }),
  daysOff: z.object({ start: hour, end: hour }).default({ start: 10, end: 18 }),
  focus: z.enum(FOCUS_PARTS).default("m"),
  maxBlock: z
    .number()
    .refine((n) => (MAX_BLOCKS as readonly number[]).includes(n))
    .default(90),
  buffer: z
    .number()
    .refine((n) => (BUFFERS as readonly number[]).includes(n))
    .default(10),
  lunch: z.boolean().default(true),
  /** Which calendars the person wants connected. Real connection happens in an account. */
  calendars: z.array(z.enum(CALENDAR_LINKS)).max(3).default([]),
  reminders: z.enum(REMINDER_MODES).default("5"),
});

export type OnboardingAnswers = z.infer<typeof onboardingAnswersSchema>;

export function defaultAnswers(): OnboardingAnswers {
  return onboardingAnswersSchema.parse({});
}

/**
 * What the design starts with: three areas picked, the two top suggestions of
 * each already on, one ritual on.
 */
export function startingAnswers(): OnboardingAnswers {
  const areas = ["work", "fitness", "language"];
  return {
    ...defaultAnswers(),
    areas,
    picks: CATALOG_TASKS.filter((t) => t.top && areas.includes(t.area)).map(
      (t) => t.id
    ),
    rituals: ["fix-review"],
  };
}

/** Why an answers object is not good enough to plan with, or null. */
export function planBlocker(a: OnboardingAnswers): string | null {
  if (a.areas.length === 0) return "Pick at least one area.";
  if (a.workdays.length === 0) return "Pick at least one workday.";
  if (a.hours.end - a.hours.start < 3)
    return "A workday needs at least three hours.";
  if (a.weekends && a.daysOff.end - a.daysOff.start < 2)
    return "A day off needs at least two hours.";
  return null;
}

/**
 * One planner input row: a picked suggestion, a typed task or a ritual, with
 * the repeat count that applies. Rows with 0 repeats are dropped.
 */
export interface PlanTask {
  id: string;
  area: string;
  title: string;
  minutes: number;
  rep: number;
  when: "m" | "a" | "e" | "";
  ritual: boolean;
}

export function planTasks(a: OnboardingAnswers): PlanTask[] {
  const out: PlanTask[] = [];
  for (const t of CATALOG_TASKS) {
    if (!a.picks.includes(t.id) || !a.areas.includes(t.area)) continue;
    out.push({
      id: t.id,
      area: t.area,
      title: t.title,
      minutes: t.minutes,
      rep: a.reps[t.id] ?? t.rep,
      when: t.when,
      ritual: false,
    });
  }
  for (const o of a.own) {
    if (!a.areas.includes(o.area)) continue;
    out.push({
      id: o.id,
      area: o.area,
      title: o.title,
      minutes: o.minutes,
      rep: a.reps[o.id] ?? o.rep,
      when: "",
      ritual: false,
    });
  }
  const home = a.areas.includes("work") ? "work" : (a.areas[0] ?? "work");
  for (const r of RITUALS) {
    if (!a.rituals.includes(r.id)) continue;
    out.push({
      id: r.id,
      area: home,
      title: r.title,
      minutes: r.minutes,
      rep: r.rep,
      when: r.when,
      ritual: true,
    });
  }
  return out.filter((t) => t.rep > 0);
}

/** Area order for the planner: tapped order first, then the order they were picked. */
export function rankedAreas(a: OnboardingAnswers): string[] {
  const tapped = a.rank.filter((id) => a.areas.includes(id));
  return [...tapped, ...a.areas.filter((id) => !tapped.includes(id))];
}
