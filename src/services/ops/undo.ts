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
  return value
    .filter(
      (row): row is TouchedRow =>
        typeof row === "object" &&
        row !== null &&
        TOUCHED_MODELS.includes((row as TouchedRow).model) &&
        typeof (row as TouchedRow).id === "string" &&
        typeof (row as TouchedRow).updatedAt === "string"
    )
    .map((row) => ({ ...row, beforeUpdatedAt: row.beforeUpdatedAt ?? null }));
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
        : model === "habit"
          ? await tx.habit.findUnique({ where: { id }, select })
          : await tx.scheduledBlock.findUnique({ where: { id }, select });
  return row?.updatedAt.toISOString() ?? null;
}

/**
 * A row matches when it still carries the version this action left. Inside
 * one run it also matches when the next action on that row (the one whose
 * `beforeUpdatedAt` is this action's `updatedAt`) has already been undone and
 * the row still carries the version that undo left. Anything else, including
 * an edit that landed between this action and the next, is a conflict.
 */
async function findConflicts(
  tx: OpClient,
  action: AgentAction
): Promise<UndoConflict[]> {
  const targets = asTouched(action.targetVersions);
  if (!targets.length) return [];

  const laterUndone = action.runId
    ? await tx.agentAction.findMany({
        where: {
          runId: action.runId,
          userId: action.userId,
          status: "undone",
          id: { not: action.id },
          createdAt: { gte: action.createdAt },
        },
        select: { targetVersions: true, undoneVersions: true },
      })
    : [];

  const restoredBySuccessor = (target: TouchedRow, current: string) =>
    laterUndone.some((later) => {
      const applied = asTouched(later.targetVersions).find(
        (row) => row.model === target.model && row.id === target.id
      );
      if (applied?.beforeUpdatedAt !== target.updatedAt) return false;
      const restored = asTouched(later.undoneVersions).find(
        (row) => row.model === target.model && row.id === target.id
      );
      return restored?.updatedAt === current;
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
    if (restoredBySuccessor(target, current)) continue;
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

const UNDOABLE_STATUSES = ["applied", "undo_conflict"];

async function undoLoadedAction(
  action: AgentAction,
  actor: OpActor
): Promise<ActionUndoResult> {
  const base = { actionId: action.id, op: action.op };
  if (action.status === "undone" || action.status === "undoing") {
    return { ...base, status: "already_undone" };
  }
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
    // Claim first: a second undo of the same action waits on this row and
    // then finds nothing to claim, so the inverse runs at most once.
    const claim = await tx.agentAction.updateMany({
      where: { id: action.id, status: { in: UNDOABLE_STATUSES } },
      data: { status: "undoing" },
    });
    if (claim.count === 0) {
      const latest = await tx.agentAction.findUnique({
        where: { id: action.id },
        select: { status: true },
      });
      return { kind: "claimed_elsewhere" as const, status: latest?.status };
    }
    const conflicts = await findConflicts(tx, action);
    if (conflicts.length) {
      await tx.agentAction.update({
        where: { id: action.id },
        data: { status: "undo_conflict" },
      });
      return { kind: "conflict" as const, conflicts };
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
    return { kind: "undone" as const, output };
  });

  if (outcome.kind === "claimed_elsewhere") {
    return outcome.status === "failed"
      ? { ...base, status: "not_undoable", reason: "failed" }
      : { ...base, status: "already_undone" };
  }
  if (outcome.kind === "conflict") {
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
