import { WorkspaceRole } from "@prisma/client";

import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { addCalendarDays, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { UNDO_WINDOW_DAYS } from "./constants";
import { OpError } from "./errors";
import { toJson } from "./helpers";
import { zodToJsonSchema } from "./json-schema";
import { eventPageOps } from "./ops/events-pages";
import { mailHabitOps } from "./ops/mail-habits";
import { personalOps } from "./ops/personal";
import { projectOps } from "./ops/projects";
import { scheduleOps } from "./ops/schedule";
import { taskOps } from "./ops/tasks";
import type {
  OpActor,
  OpClient,
  OpContext,
  OpDefinition,
  OpInverse,
  OpRunOutput,
} from "./types";

const LOG_SOURCE = "ops-registry";

/** How long an applied action stays undoable. */
export { UNDO_WINDOW_DAYS } from "./constants";

const ROLE_RANK: Record<WorkspaceRole, number> = {
  [WorkspaceRole.VIEWER]: 0,
  [WorkspaceRole.EDITOR]: 1,
  [WorkspaceRole.OWNER]: 2,
};

const registry = new Map<string, OpDefinition>();
for (const op of [
  ...taskOps,
  ...projectOps,
  ...scheduleOps,
  ...mailHabitOps,
  ...eventPageOps,
  ...personalOps,
] as OpDefinition[]) {
  if (registry.has(op.name)) throw new Error(`Duplicate op ${op.name}`);
  registry.set(op.name, op);
}

/** Looks up a public op. Internal (inverse-only) ops are not returned. */
export function getOp(name: string): OpDefinition | undefined {
  const op = registry.get(name);
  return op && !op.internal ? op : undefined;
}

export function listOps() {
  return [...registry.values()]
    .filter((op) => !op.internal)
    .map((op) => ({
      name: op.name,
      description: op.description,
      risk: op.risk,
      input: zodToJsonSchema(op.input),
    }));
}

export function requiredRoleFor(op: OpDefinition) {
  return op.risk === "read" ? WorkspaceRole.VIEWER : WorkspaceRole.EDITOR;
}

export interface RunOpOptions {
  userId: string;
  workspace: WorkspaceAccess;
  actor: OpActor;
  runId?: string | null;
}

export interface RunOpResult<Result = unknown> {
  op: string;
  result: Result;
  actionId: string | null;
  undoable: boolean;
  undoableUntil: string | null;
}

function buildContext(options: RunOpOptions, tx: OpClient): OpContext {
  return {
    userId: options.userId,
    workspaceId: options.workspace.workspaceId,
    workspace: options.workspace,
    scope: workspaceDataScopeWhere(options.workspace, options.userId),
    actor: options.actor,
    runId: options.runId ?? null,
    tx,
  };
}

function parseInput(op: OpDefinition, rawInput: unknown) {
  const parsed = op.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    throw new OpError("INVALID_INPUT", "Invalid input", parsed.error.issues);
  }
  return parsed.data;
}

export async function runAfterCommit(
  op: string,
  effects: OpRunOutput<unknown>["afterCommit"]
) {
  for (const effect of effects ?? []) {
    try {
      await effect();
    } catch (error) {
      logger.warn(
        "Op side effect failed after commit",
        { op, error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
    }
  }
}

async function recordAction(
  client: OpClient,
  op: OpDefinition,
  input: unknown,
  output: OpRunOutput<unknown>,
  options: RunOpOptions
) {
  const inverse = op.risk === "reversible" ? (output.inverse ?? null) : null;
  return client.agentAction.create({
    data: {
      runId: options.runId ?? null,
      userId: options.userId,
      workspaceId: options.workspace.workspaceId,
      actor: options.actor,
      op: op.name,
      input: toJson(input),
      before: toJson(output.before ?? null),
      inverse: inverse ? toJson(inverse) : undefined,
      targetVersions: toJson(output.touched ?? []),
      status: "applied",
      undoableUntil: inverse
        ? addCalendarDays(newDate(), UNDO_WINDOW_DAYS)
        : null,
    },
    select: { id: true, undoableUntil: true, inverse: true },
  });
}

/**
 * The single entry point for running an operation: validates input, enforces
 * the workspace role, runs the op in a transaction, and logs every write as
 * an AgentAction (with its inverse) in that same transaction.
 */
export async function runOp<Result = unknown>(
  name: string,
  rawInput: unknown,
  options: RunOpOptions
): Promise<RunOpResult<Result>> {
  const op = getOp(name);
  if (!op) throw new OpError("OP_NOT_FOUND", `Unknown operation ${name}`);
  const input = parseInput(op, rawInput);

  if (ROLE_RANK[options.workspace.role] < ROLE_RANK[requiredRoleFor(op)]) {
    throw new OpError("FORBIDDEN", "This workspace role cannot change data");
  }

  if (op.risk === "read") {
    const output = await op.run(buildContext(options, prisma), input);
    return {
      op: op.name,
      result: output.result as Result,
      actionId: null,
      undoable: false,
      undoableUntil: null,
    };
  }

  let output: OpRunOutput<unknown>;
  let action: Awaited<ReturnType<typeof recordAction>>;
  if (op.transactional === false) {
    output = await op.run(buildContext(options, prisma), input);
    try {
      action = await recordAction(prisma, op, input, output, options);
    } catch (error) {
      // The change is already in the database and cannot be rolled back
      // here. Keep the snapshot in the logs so it can be restored by hand.
      logger.error(
        "Op applied but its action log row could not be written",
        {
          op: op.name,
          userId: options.userId,
          workspaceId: options.workspace.workspaceId,
          before: JSON.stringify(output.before ?? null),
          inverse: JSON.stringify(output.inverse ?? null),
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
      await runAfterCommit(op.name, output.afterCommit);
      throw new OpError(
        "APPLIED_NOT_UNDOABLE",
        "The change was applied but could not be recorded, so it cannot be undone",
        { op: op.name, result: toJson(output.result ?? null) }
      );
    }
  } else {
    ({ output, action } = await prisma.$transaction(async (tx) => {
      const result = await op.run(buildContext(options, tx), input);
      return {
        output: result,
        action: await recordAction(tx, op, input, result, options),
      };
    }));
  }

  logger.info(
    "Op applied",
    {
      op: op.name,
      actionId: action.id,
      actor: options.actor,
      userId: options.userId,
    },
    LOG_SOURCE
  );
  await runAfterCommit(op.name, output.afterCommit);

  return {
    op: op.name,
    result: output.result as Result,
    actionId: action.id,
    undoable: Boolean(action.inverse),
    undoableUntil: action.undoableUntil?.toISOString() ?? null,
  };
}

/**
 * Runs a stored inverse inside the caller's transaction. Internal ops are
 * allowed here; nothing is logged as a new action.
 */
export async function applyInverse(
  inverse: OpInverse,
  options: RunOpOptions,
  tx: OpClient
) {
  const op = registry.get(inverse.op);
  if (!op) throw new OpError("OP_NOT_FOUND", `Unknown inverse ${inverse.op}`);
  const input = parseInput(op, inverse.input);
  return op.run(buildContext(options, tx), input);
}
