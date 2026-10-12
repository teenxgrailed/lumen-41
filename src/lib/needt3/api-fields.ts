import { z } from "zod";

import { newDate } from "@/lib/date-utils";

/**
 * Zod schemas for the fields the design v3 port added (migrations
 * 20261009100000…120000, docs/port/01-data-map.md). Existing routes keep their
 * own hand validation for the old fields and run these over the body, so a
 * new field is either valid or the request is a 400 — never passed through
 * to Prisma unchecked.
 *
 * Every field is optional: absent means "leave it alone"; `null` clears it.
 */

const shortText = (max: number) => z.string().trim().max(max);
const nullableShort = (max: number) => shortText(max).nullable();

/** A JSON object of bounded size (style maps, preferences, sync options). */
export const jsonObjectSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => JSON.stringify(value).length <= 32_000, {
    message: "Object too large",
  });

const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(newDate(value).getTime()), {
    message: "Invalid date",
  })
  .transform((value) => newDate(value));

export const ORIGIN_KINDS = ["mail", "doc", "chat"] as const;
export type OriginKind = (typeof ORIGIN_KINDS)[number];

export const taskV3FieldsSchema = z.object({
  trashedAt: isoDateTime.nullable().optional(),
  originKind: z.enum(ORIGIN_KINDS).nullable().optional(),
  originId: nullableShort(200).optional(),
  originQuote: nullableShort(2000).optional(),
  splitAllowed: z.boolean().optional(),
});

export const projectV3FieldsSchema = z.object({
  ground: nullableShort(64).optional(),
  position: z.number().finite().optional(),
});

export const pageV3FieldsSchema = z.object({
  style: jsonObjectSchema.nullable().optional(),
  projectId: z.string().min(1).max(64).nullable().optional(),
});

/** Mail stays read-only at the provider: these only change Needt's copy. */
export const mailV3FieldsSchema = z.object({
  trashed: z.boolean().optional(),
  needsReply: z.boolean().nullable().optional(),
});

export const moodboardV3FieldsSchema = z.object({
  projectId: z.string().min(1).max(64).nullable().optional(),
  linkShare: z.boolean().optional(),
  pinterestBoardId: nullableShort(200).optional(),
  trashed: z.boolean().optional(),
});

export const userSettingsV3FieldsSchema = z.object({
  prefs: jsonObjectSchema.optional(),
});

export const notificationSettingsV3FieldsSchema = z.object({
  dailyPlan: z.boolean().optional(),
  dailyPlanTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  mailPlan: z.boolean().optional(),
  nudges: z.boolean().optional(),
  weeklyReview: z.boolean().optional(),
});

type Parsed<S extends z.ZodTypeAny> =
  | { ok: true; data: z.output<S> }
  | { ok: false; error: string };

/**
 * Parse only the keys a schema knows, from any request body. Unknown keys
 * are ignored (the route's own validation owns them); keys that are present
 * but `undefined` are dropped from the result.
 */
export function parseV3Fields<S extends z.AnyZodObject>(
  schema: S,
  body: unknown
): Parsed<S> {
  const source =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const picked: Record<string, unknown> = {};
  for (const key of Object.keys(schema.shape)) {
    if (key in source && source[key] !== undefined) picked[key] = source[key];
  }
  const result = schema.safeParse(picked);
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      ok: false,
      error: `Invalid ${issue?.path.join(".") || "field"}: ${issue?.message ?? "invalid"}`,
    };
  }
  const data = Object.fromEntries(
    Object.entries(result.data as Record<string, unknown>).filter(
      ([, value]) => value !== undefined
    )
  );
  return { ok: true, data: data as z.output<S> };
}

/** `{ trashed: boolean }` → the `trashedAt` column value, or undefined. */
export function trashedAtFrom(trashed: boolean | undefined) {
  if (trashed === undefined) return undefined;
  return trashed ? newDate() : null;
}
