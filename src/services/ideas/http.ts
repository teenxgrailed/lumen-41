import { NextRequest, NextResponse } from "next/server";

import { OpError, runOp } from "@/services/ops";
import { opErrorResponse } from "@/services/ops/http";
import type { OpActor } from "@/services/ops/types";
import { z } from "zod";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";

/**
 * The idea verbs once, for both doors: `/api/ideas/*` (the app's session) and
 * `/api/connect/ideas/*` (a connector token). The route file authenticates (so
 * the auth is visible where the handler is) and hands the caller here. Each
 * handler runs one op and answers with its result and `actionId` (undo:
 * `POST /api/agent/actions/:id/undo`). Nothing here decides a rule.
 */

export interface Caller {
  userId: string;
  workspace: WorkspaceAccess;
  actor: OpActor;
}

/** What the session door authenticated: a signed-in person in a workspace. */
export const sessionCaller = (auth: {
  userId?: string;
  workspace?: WorkspaceAccess;
}): Caller => ({
  userId: auth.userId as string,
  workspace: auth.workspace as WorkspaceAccess,
  actor: "user",
});

/** What the connector door authenticated: a token. */
export const tokenCaller = (auth: {
  userId?: string;
  workspace?: WorkspaceAccess;
}): Caller => ({
  userId: auth.userId as string,
  workspace: auth.workspace as WorkspaceAccess,
  actor: "mcp",
});

const num = (value: string | null) =>
  value === null || value === "" ? undefined : Number(value);

const convertBody = z.object({ to: z.enum(["idea", "task"]) }).strict();

async function respond(logSource: string, run: () => Promise<unknown>) {
  try {
    return NextResponse.json(await run());
  } catch (error) {
    return opErrorResponse(error, logSource);
  }
}

const readBody = async (request: NextRequest) => {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new OpError("INVALID_INPUT", "Body must be JSON");
  }
};

export const ideaHandlers = {
  /** GET /ideas?state=ready|snoozed|all&query=&limit=&cursor= */
  list: (request: NextRequest, caller: Caller, logSource: string) =>
    respond(logSource, async () => {
      const q = request.nextUrl.searchParams;
      return runOp(
        "idea.list",
        {
          ...(q.get("state") ? { state: q.get("state") } : {}),
          ...(q.get("query") ? { query: q.get("query") } : {}),
          ...(q.get("limit") ? { limit: num(q.get("limit")) } : {}),
          ...(q.get("cursor") ? { cursor: q.get("cursor") } : {}),
        },
        caller
      );
    }),

  /** POST /ideas { title, notes?, projectId?, estimateMinutes?, ... } */
  create: (request: NextRequest, caller: Caller, logSource: string) =>
    respond(logSource, async () =>
      runOp("idea.create", await readBody(request), caller)
    ),

  /** GET /ideas/cards?day=YYYY-MM-DD&surface=today&visibleTasks=n */
  cards: (request: NextRequest, caller: Caller, logSource: string) =>
    respond(logSource, async () => {
      const q = request.nextUrl.searchParams;
      return runOp(
        "idea.cards",
        {
          ...(q.get("day") ? { day: q.get("day") } : {}),
          ...(q.get("surface") ? { surface: q.get("surface") } : {}),
          ...(q.get("visibleTasks")
            ? { visibleTasks: num(q.get("visibleTasks")) }
            : {}),
        },
        caller
      );
    }),

  /** PATCH /ideas/:id: the fields of an idea; a date is refused. */
  update: (
    request: NextRequest,
    caller: Caller,
    id: string,
    logSource: string
  ) =>
    respond(logSource, async () => {
      const found = await runOp<{ task: { kind: string } }>(
        "task.get",
        { taskId: id },
        caller
      );
      if (found.result.task.kind !== "idea") {
        throw new OpError("NOT_FOUND", "Idea not found");
      }
      const patch = await readBody(request);
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        throw new OpError("INVALID_INPUT", "Body must be an object");
      }
      return runOp("task.update", { ...patch, taskId: id }, caller);
    }),

  /** POST /ideas/:id/take */
  take: (caller: Caller, id: string, logSource: string) =>
    respond(logSource, () => runOp("idea.take", { taskId: id }, caller)),

  /** POST /ideas/:id/skip */
  skip: (caller: Caller, id: string, logSource: string) =>
    respond(logSource, () => runOp("idea.skip", { taskId: id }, caller)),

  /** POST /ideas/:id/convert { to: "idea" | "task" } (:id is a task or an idea) */
  convert: (
    request: NextRequest,
    caller: Caller,
    id: string,
    logSource: string
  ) =>
    respond(logSource, async () => {
      const parsed = convertBody.safeParse(await readBody(request));
      if (!parsed.success) {
        throw new OpError(
          "INVALID_INPUT",
          'Send { "to": "idea" } or { "to": "task" }'
        );
      }
      return runOp("idea.convert", { taskId: id, to: parsed.data.to }, caller);
    }),
};
