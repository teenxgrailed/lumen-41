import { type AgentAction, WorkspaceRole } from "@prisma/client";

import {
  WorkspaceAuthorizationError,
  resolveWorkspaceAccess,
} from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { OpError } from "./errors";
import { toJson } from "./helpers";
import { applyInverse, runAfterCommit } from "./registry";
import {
  type OpActor,
  type OpClient,
  type OpInverse,
  type OpRunOutput,
  TOUCHED_MODELS,
  type TouchedRow,
} from "./types";

const LOG_SOURCE = "ops-undo";

export type UndoConflict = {
  model: TouchedRow["model"];
  id: string;
  expectedUpdatedAt: string;
  currentUpdatedAt: string | null;
  reason: "changed" | "deleted";
};

export type ActionUndoResult =
  | { actionId: string; op: string; status: "undone" }
  | { actionId: string; op: string; status: "already_undone" }
  | {
      actionId: string;
      op: string;
      status: "undo_conflict";
      conflicts: UndoConflict[];
    }
  | {
      actionId: string;
      op: string;
      status: "not_undoable";
      reason: "no_inverse" | "expired" | "failed";
    };

function asTouched(value: unknown): TouchedRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is TouchedRow =>
      typeof row === "object" &&
      row !== null &&
      TOUCHED_MODELS.includes((row as TouchedRow).model) &&
      typeof (row as TouchedRow).id === "string" &&
      typeof (row as TouchedRow).updatedAt === "string"
  );
}

async function currentVersion(
  tx: OpClient,
  model: TouchedRow["model"],
  id: string
) {
  const select = { updatedAt: true } as const;
  const row =
    model === "task"
      ? await tx.task.findUnique({ where: { id }, select })
      : model === "project"
        ? await tx.project.findUnique({ where: { id }, select })
        : await tx.habit.findUnique({ where: { id }, select });
  return row?.updatedAt.toISOString() ?? null;
}

/**
 * A row matches when it still carries the version this action left, or the
 * version a later, already-undone action left when it restored the row. The
 * second case is what lets a run undo in reverse order without tripping on
 * its own restores.
 */
async function findConflicts(
  tx: OpClient,
  action: AgentAction
): Promise<UndoConflict[]> {
  const targets = asTouched(action.targetVersions);
  if (!targets.length) return [];

  const laterUndone = await tx.agentAction.findMany({
    where: {
      userId: action.userId,
      workspaceId: action.workspaceId,
      status: "undone",
      createdAt: { gte: action.createdAt },
      id: { not: action.id },
    },
    orderBy: { undoneAt: "desc" },
    select: { undoneVersions: true },
    take: 200,
  });

  const conflicts: UndoConflict[] = [];
  for (const target of targets) {
    const current = await currentVersion(tx, target.model, target.id);
    if (current === null) {
      conflicts.push({
        model: target.model,
        id: target.id,
        expectedUpdatedAt: target.updatedAt,
        currentUpdatedAt: null,
        reason: "deleted",
      });
      continue;
    }
    if (current === target.updatedAt) continue;
    const latestRestore = laterUndone
      .flatMap((row) => asTouched(row.undoneVersions))
      .find((row) => row.model === target.model && row.id === target.id);
    if (latestRestore?.updatedAt === current) continue;
    conflicts.push({
      model: target.model,
      id: target.id,
      expectedUpdatedAt: target.updatedAt,
      currentUpdatedAt: current,
      reason: "changed",
    });
  }
  return conflicts;
}

async function undoLoadedAction(
  action: AgentAction,
  actor: OpActor
): Promise<ActionUndoResult> {
  const base = { actionId: action.id, op: action.op };
  if (action.status === "undone") return { ...base, status: "already_undone" };
  if (action.status === "failed") {
    return { ...base, status: "not_undoable", reason: "failed" };
  }
  const inverse = action.inverse as OpInverse | null;
  if (!inverse || typeof inverse.op !== "string") {
    return { ...base, status: "not_undoable", reason: "no_inverse" };
  }
  if (action.undoableUntil && action.undoableUntil < newDate()) {
    return { ...base, status: "not_undoable", reason: "expired" };
  }

  let workspace;
  try {
    workspace = await resolveWorkspaceAccess({
      userId: action.userId,
      requestedWorkspaceId: action.workspaceId,
      requiredRole: WorkspaceRole.EDITOR,
    });
  } catch (error) {
    if (error instanceof WorkspaceAuthorizationError) {
      throw new OpError("FORBIDDEN", error.message);
    }
    throw error;
  }
  if (workspace.workspaceId !== action.workspaceId) {
    throw new OpError(
      "FORBIDDEN",
      "This action belongs to a workspace that is not available"
    );
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const conflicts = await findConflicts(tx, action);
    if (conflicts.length) {
      await tx.agentAction.update({
        where: { id: action.id },
        data: { status: "undo_conflict" },
      });
      return { conflicts, output: null };
    }
    const output = await applyInverse(
      inverse,
      { userId: action.userId, workspace, actor, runId: action.runId },
      tx
    );
    await tx.agentAction.update({
      where: { id: action.id },
      data: {
        status: "undone",
        undoneAt: newDate(),
        undoneVersions: toJson(output.touched ?? []),
      },
    });
    return { conflicts, output };
  });

  if (outcome.conflicts.length) {
    logger.info(
      "Undo refused: rows changed after the action",
      { actionId: action.id, conflicts: outcome.conflicts.length },
      LOG_SOURCE
    );
    return { ...base, status: "undo_conflict", conflicts: outcome.conflicts };
  }
  await runAfterCommit(
    inverse.op,
    (outcome.output as OpRunOutput<unknown>).afterCommit
  );
  logger.info(
    "Action undone",
    { actionId: action.id, op: action.op },
    LOG_SOURCE
  );
  return { ...base, status: "undone" };
}

/** Undo one action. Another user's action is reported as not found. */
export async function undoAction(
  actionId: string,
  userId: string,
  actor: OpActor = "user"
) {
  const action = await prisma.agentAction.findFirst({
    where: { id: actionId, userId },
  });
  if (!action) throw new OpError("NOT_FOUND", "Action not found");
  return undoLoadedAction(action, actor);
}

export type RunUndoResult = {
  runId: string;
  status: "undone" | "partial";
  results: ActionUndoResult[];
  /** Applied actions left in place because an undo before them conflicted. */
  remaining: string[];
};

/**
 * Undo every action of a run, newest first. Stops at the first conflict so
 * an older action is never reversed underneath a newer one that stayed.
 */
export async function undoRun(
  runId: string,
  userId: string,
  actor: OpActor = "user"
): Promise<RunUndoResult> {
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, userId },
    select: { id: true },
  });
  if (!run) throw new OpError("NOT_FOUND", "Run not found");

  const actions = await prisma.agentAction.findMany({
    where: { runId, userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  const results: ActionUndoResult[] = [];
  let stoppedAt = -1;
  for (const [index, action] of actions.entries()) {
    const result = await undoLoadedAction(action, actor);
    results.push(result);
    if (result.status === "undo_conflict") {
      stoppedAt = index;
      break;
    }
  }

  const remaining =
    stoppedAt >= 0
      ? actions
          .slice(stoppedAt + 1)
          .filter((action) => action.status === "applied")
          .map((action) => action.id)
      : [];
  const complete = stoppedAt < 0;
  if (complete) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "undone" },
    });
  }
  return {
    runId: run.id,
    status: complete ? "undone" : "partial",
    results,
    remaining,
  };
}
