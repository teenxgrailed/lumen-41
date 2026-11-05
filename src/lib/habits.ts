import {
  HabitEventType,
  HabitKind,
  SchedulingEnergyLevel,
  SchedulingTaskPriority,
} from "@prisma/client";
import { z } from "zod";

export const habitInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  targetOccurrencesPerWeek: z.number().int().min(1).max(7),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  estimatedMinutes: z.number().int().min(5).max(480),
  energyRequired: z
    .nativeEnum(SchedulingEnergyLevel)
    .default(SchedulingEnergyLevel.MEDIUM),
  priority: z
    .nativeEnum(SchedulingTaskPriority)
    .default(SchedulingTaskPriority.MEDIUM),
  scheduleId: z.string().min(1).nullable().optional(),
  isActive: z.boolean().default(true),
  // Design v3: time of day, weekly quota, project, own colour and glyph.
  at: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  quota: z.number().int().min(1).max(7).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  color: z.string().trim().max(64).nullable().optional(),
  icon: z.string().trim().max(64).nullable().optional(),
  // QUIT habits (Pro, behind `habits_quit`): see `quitFieldsError` and
  // src/lib/habits-quit.ts. A BUILD habit carries neither of the two below.
  kind: z.nativeEnum(HabitKind).default(HabitKind.BUILD),
  quitStartedAt: z.coerce.date().nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
});

/** A quit date may be at most a day ahead (time zone slack), never further. */
const QUIT_START_SLACK_MS = 24 * 60 * 60 * 1000;

/**
 * Cross-field rules for the QUIT fields, shared by create and edit. `kind` is
 * the habit's kind after the write. Returns an error message or null.
 */
export function quitFieldsError(
  kind: HabitKind,
  data: { quitStartedAt?: Date | null; reason?: string | null },
  now: Date
): string | null {
  if (kind !== HabitKind.QUIT) {
    if (data.quitStartedAt || data.reason) {
      return "quitStartedAt and reason are for quit habits only";
    }
    return null;
  }
  if (
    data.quitStartedAt &&
    data.quitStartedAt.getTime() > now.getTime() + QUIT_START_SLACK_MS
  ) {
    return "quitStartedAt cannot be in the future";
  }
  return null;
}

/** A line in a habit's event log (POST /api/habits/:id/events). */
export const habitEventInputSchema = z.object({
  type: z.nativeEnum(HabitEventType),
  // When it happened; now when omitted. Never in the future.
  at: z.coerce.date().optional(),
  tag: z.string().trim().min(1).max(64).nullable().optional(),
  intensity: z.number().int().min(1).max(5).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

/**
 * PATCH /api/habits/:id/events/:eventId: the details written onto an event
 * after it was logged (an urge is created on press, tagged later). The type
 * and the time never change.
 */
export const habitEventPatchSchema = z
  .object({
    tag: z.string().trim().min(1).max(64).nullable().optional(),
    intensity: z.number().int().min(1).max(5).nullable().optional(),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Nothing to change",
  });
