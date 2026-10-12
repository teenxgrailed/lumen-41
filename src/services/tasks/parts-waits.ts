import { NextResponse } from "next/server";

import type { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

/**
 * Parts (TaskPart) and waits (TaskWait) of one task. Every route resolves the
 * task through the same workspace scope as `/api/tasks/[id]`, so a task in
 * another workspace is a 404, never a 403 that would confirm it exists.
 */

/** What `GET /api/tasks` and `GET /api/tasks/[id]` include. */
export const partsWaitsInclude = {
  parts: {
    orderBy: { position: "asc" },
    select: { id: true, title: true, done: true, position: true },
  },
  waits: {
    where: { resolvedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      reason: true,
      resolvedAt: true,
      createdAt: true,
      waitingOnUserId: true,
      waitingOnUser: { select: { id: true, name: true, image: true } },
    },
  },
} satisfies Prisma.TaskInclude;

export const partSelect = partsWaitsInclude.parts.select;
export const waitSelect = partsWaitsInclude.waits.select;

export interface PartsWaitsAuth {
  userId: string;
  workspace?: WorkspaceAccess;
}

export const notFound = (what = "Task") =>
  NextResponse.json({ error: `${what} not found` }, { status: 404 });

/** The task's id when the caller may see it, else null. */
export async function scopedTaskId(auth: PartsWaitsAuth, taskId: string) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      ...workspaceDataScopeWhere(auth.workspace, auth.userId),
    },
    select: { id: true },
  });
  return task?.id ?? null;
}

/**
 * Who a task may wait on: the caller, or a member of the caller's workspace.
 * Anyone else would let a request probe user ids.
 */
export async function canWaitOn(auth: PartsWaitsAuth, personId: string) {
  if (personId === auth.userId) return true;
  if (auth.workspace?.dataScope.mode !== "workspace") return false;
  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: auth.workspace.dataScope.workspaceId,
        userId: personId,
      },
    },
    select: { id: true },
  });
  return !!member;
}

/** Next position after the task's last part. */
export async function nextPartPosition(taskId: string) {
  const last = await prisma.taskPart.findFirst({
    where: { taskId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? 0) + 1024;
}

/**
 * Open a wait. A task waits on one person at a time, so earlier open waits
 * are resolved in the same transaction (history is kept, not deleted).
 */
export async function openWait(
  taskId: string,
  personId: string,
  reason: string
) {
  const now = newDate();
  const [, wait] = await prisma.$transaction([
    prisma.taskWait.updateMany({
      where: { taskId, resolvedAt: null },
      data: { resolvedAt: now },
    }),
    prisma.taskWait.create({
      data: { taskId, waitingOnUserId: personId, reason },
      select: waitSelect,
    }),
  ]);
  return wait;
}

export const partCreateSchema = z.object({
  title: z.string().trim().min(1).max(500),
  done: z.boolean().optional(),
  position: z.number().finite().optional(),
});

export const partPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    done: z.boolean().optional(),
    position: z.number().finite().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to change" });

export const waitCreateSchema = z.object({
  on: z.string().min(1),
  for: z.string().trim().min(1).max(500),
});

/** `PATCH …/waits/[waitId]`: resolve (`resolved: true`) or reopen. */
export const waitPatchSchema = z.object({
  resolved: z.boolean(),
});

/** Parse a JSON body against `schema`; a 400 response on failure. */
export async function readBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<{ data: T } | { response: NextResponse }> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return {
      response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
    };
  }
  const parsed = schema.safeParse(json);
  return parsed.success
    ? { data: parsed.data }
    : {
        response: NextResponse.json(
          { error: "Invalid body", issues: parsed.error.issues },
          { status: 400 }
        ),
      };
}
