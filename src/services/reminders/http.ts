/* Shared by `/api/reminders` (signed-in session) and `/api/connect/reminders`
 * (bearer token): same validation, same bodies. */
import { NextResponse } from "next/server";

import { z } from "zod";

import {
  type ServiceResult,
  createReminder,
  deleteReminder,
  getReminder,
  listReminders,
  reminderCreateSchema,
  reminderUpdateSchema,
  toReminderView,
  updateReminder,
  userTimeZone,
} from "./reminders";

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function fromResult<T>(result: ServiceResult<T>, status = 200) {
  if (result.ok) return NextResponse.json(result.value, { status });
  const body =
    typeof result.error === "string" ? { error: result.error } : result.error;
  return NextResponse.json(body, { status: result.status });
}

function invalid(error: z.ZodError) {
  return NextResponse.json(
    {
      error: "Invalid reminder",
      issues: error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    },
    { status: 400 }
  );
}

const listQuery = z.object({
  taskId: z.string().min(1).optional(),
  eventId: z.string().min(1).optional(),
  status: z.enum(["upcoming", "all"]).optional(),
});

export async function listRemindersResponse(
  userId: string,
  params: URLSearchParams
) {
  const parsed = listQuery.safeParse(Object.fromEntries(params));
  if (!parsed.success) return invalid(parsed.error);
  const reminders = await listReminders(userId, parsed.data);
  return NextResponse.json(
    { reminders },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function createReminderResponse(userId: string, request: Request) {
  const parsed = reminderCreateSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  return fromResult(await createReminder(userId, parsed.data), 201);
}

export async function getReminderResponse(userId: string, id: string) {
  const row = await getReminder(userId, id);
  if (!row) {
    return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
  }
  return NextResponse.json(toReminderView(row, await userTimeZone(userId)));
}

export async function updateReminderResponse(
  userId: string,
  id: string,
  request: Request
) {
  const parsed = reminderUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  return fromResult(await updateReminder(userId, id, parsed.data));
}

export async function deleteReminderResponse(userId: string, id: string) {
  const result = await deleteReminder(userId, id);
  return result.ok
    ? new NextResponse(null, { status: 204 })
    : fromResult(result);
}
