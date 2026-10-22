import { z } from "zod";

/*
 * What a person may set on their auto-schedule settings through
 * /api/auto-schedule-settings. The row is scoped to the caller, but the body
 * used to go to Prisma as it came: identity columns (id, userId) could be
 * rewritten and pushTasksFeedId could name a calendar that belongs to someone
 * else. Only the preference columns are listed here; everything else in the
 * body is dropped, and a nested value under an unknown key is refused.
 *
 * pushTasksFeedId is the one column that points at another record. The shape
 * is checked here, ownership in the route (it needs the database).
 */

const hour = z.number().int().min(0).max(23);

/** A JSON-encoded list stored in a String column. */
const jsonList = (item: z.ZodTypeAny) =>
  z
    .string()
    .max(16_384)
    .refine(
      (raw) => {
        try {
          return z.array(item).max(500).safeParse(JSON.parse(raw)).success;
        } catch {
          return false;
        }
      },
      { message: "Must be a JSON list of valid values" }
    );

const shape = {
  workDays: jsonList(z.number().int().min(0).max(6)).optional(),
  workHourStart: hour.optional(),
  workHourEnd: hour.optional(),
  selectedCalendars: jsonList(z.string().max(200)).optional(),
  excludedCalendars: jsonList(z.string().max(200)).optional(),
  bufferMinutes: z.number().int().min(0).max(1440).optional(),
  highEnergyStart: hour.nullable().optional(),
  highEnergyEnd: hour.nullable().optional(),
  mediumEnergyStart: hour.nullable().optional(),
  mediumEnergyEnd: hour.nullable().optional(),
  lowEnergyStart: hour.nullable().optional(),
  lowEnergyEnd: hour.nullable().optional(),
  groupByProject: z.boolean().optional(),
  pushTasksToCalendar: z.boolean().optional(),
  pushTasksFeedId: z.string().min(1).max(200).nullable().optional(),
};

export const autoScheduleSettingsUpdateSchema = z.object(shape).strip();

export type AutoScheduleSettingsUpdate = z.infer<
  typeof autoScheduleSettingsUpdateSchema
>;

export type AutoScheduleSettingsParse =
  | { data: AutoScheduleSettingsUpdate }
  | { error: string };

export function parseAutoScheduleSettingsUpdate(
  body: Record<string, unknown>
): AutoScheduleSettingsParse {
  for (const [key, value] of Object.entries(body)) {
    const known = Object.prototype.hasOwnProperty.call(shape, key);
    if (!known && value !== null && typeof value === "object") {
      return { error: `${key} is not a setting` };
    }
  }

  const parsed = autoScheduleSettingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.join(".");
    return { error: path ? `${path}: ${issue.message}` : issue.message };
  }
  return { data: parsed.data };
}
