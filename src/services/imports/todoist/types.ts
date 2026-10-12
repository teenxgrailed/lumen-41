import { z } from "zod";

/**
 * The slice of a Todoist API v1 full sync (`POST /api/v1/sync`, sync_token
 * "*") the importer reads. Lenient on purpose: unknown fields pass through,
 * optional ones may be missing or null, and ids are coerced to strings
 * because older payloads used numbers.
 */

const id = z.union([z.string(), z.number()]).transform(String);
const optionalId = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => (v === null || v === undefined ? null : String(v)));
const flag = z
  .union([z.boolean(), z.number(), z.null()])
  .optional()
  .transform((v) => Boolean(v));
const optionalString = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v ?? null);

export const todoistDueSchema = z
  .object({
    date: z.string(),
    string: optionalString,
    is_recurring: flag,
    timezone: optionalString,
    lang: optionalString,
  })
  .passthrough();

export const todoistProjectSchema = z
  .object({
    id,
    name: z.string(),
    parent_id: optionalId,
    color: optionalString,
    is_archived: flag,
    is_deleted: flag,
    inbox_project: flag,
    child_order: z.number().nullable().optional(),
    updated_at: optionalString,
  })
  .passthrough();

export const todoistSectionSchema = z
  .object({
    id,
    project_id: id,
    name: z.string(),
    section_order: z.number().nullable().optional(),
    is_archived: flag,
    is_deleted: flag,
    updated_at: optionalString,
  })
  .passthrough();

export const todoistItemSchema = z
  .object({
    id,
    project_id: id,
    section_id: optionalId,
    parent_id: optionalId,
    content: z.string(),
    description: optionalString,
    priority: z.number().int().min(1).max(4).optional().default(1),
    due: todoistDueSchema.nullable().optional(),
    deadline: z
      .object({ date: z.string() })
      .passthrough()
      .nullable()
      .optional(),
    duration: z
      .object({
        amount: z.number().positive(),
        unit: z.enum(["minute", "day"]),
      })
      .nullable()
      .optional(),
    labels: z.array(z.string()).optional().default([]),
    checked: flag,
    is_deleted: flag,
    child_order: z.number().nullable().optional(),
    updated_at: optionalString,
  })
  .passthrough();

export const todoistLabelSchema = z
  .object({
    id,
    name: z.string(),
    color: optionalString,
    is_deleted: flag,
  })
  .passthrough();

export const todoistNoteSchema = z
  .object({
    id,
    item_id: optionalId,
    project_id: optionalId,
    content: z.string().optional().default(""),
    posted_at: optionalString,
    file_attachment: z.unknown().optional(),
    is_deleted: flag,
  })
  .passthrough();

export const todoistReminderSchema = z
  .object({ id, item_id: optionalId, is_deleted: flag })
  .passthrough();

export const todoistSnapshotSchema = z
  .object({
    projects: z.array(todoistProjectSchema).optional().default([]),
    sections: z.array(todoistSectionSchema).optional().default([]),
    items: z.array(todoistItemSchema).optional().default([]),
    labels: z.array(todoistLabelSchema).optional().default([]),
    notes: z.array(todoistNoteSchema).optional().default([]),
    project_notes: z.array(todoistNoteSchema).optional().default([]),
    reminders: z.array(todoistReminderSchema).optional().default([]),
  })
  .passthrough();

export type TodoistProject = z.infer<typeof todoistProjectSchema>;
export type TodoistSection = z.infer<typeof todoistSectionSchema>;
export type TodoistItem = z.infer<typeof todoistItemSchema>;
export type TodoistLabel = z.infer<typeof todoistLabelSchema>;
export type TodoistNote = z.infer<typeof todoistNoteSchema>;
export type TodoistSnapshot = z.infer<typeof todoistSnapshotSchema>;

/** Resource types requested from the sync endpoint. */
export const TODOIST_RESOURCE_TYPES = [
  "projects",
  "sections",
  "items",
  "labels",
  "notes",
  "project_notes",
  "reminders",
] as const;
