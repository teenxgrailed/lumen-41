import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { OpError } from "../errors";
import {
  type OpContext,
  type OpDefinition,
  type OpInverse,
  type OpRunOutput,
  type TouchedRow,
  defineOp,
} from "../types";

const LOG_SOURCE = "ops-batch";

/** The most steps one batch (or one delete) takes. */
export const BATCH_MAX_ITEMS = 100;
/** One transaction runs this long at most (100 task updates fit well inside). */
const BATCH_TX_TIMEOUT_MS = 60_000;

export type OpLookup = (name: string) => OpDefinition | undefined;

/** What a delete of each kind does, and the op that does it. */
export const DELETE_ITEM_TYPES = [
  "task",
  "page",
  "project",
  "habit",
  "event",
  "goal",
] as const;
export type DeleteItemType = (typeof DELETE_ITEM_TYPES)[number];

const DELETE_STEP: Record<DeleteItemType, { op: string; key: string }> = {
  task: { op: "task.trash", key: "taskId" },
  page: { op: "page.trash", key: "pageId" },
  project: { op: "project.archive", key: "projectId" },
  habit: { op: "habit.archive", key: "habitId" },
  event: { op: "event.delete", key: "eventId" },
  goal: { op: "goal.archive", key: "goalId" },
};

type Step = { op: string; input: unknown };
type StepOutcome =
  | { index: number; ok: true; op: string; output: OpRunOutput<unknown> }
  | {
      index: number;
      ok: false;
      op: string;
      code: string;
      error: string;
    };

/**
 * Why an op may not run inside a batch: only reversible writes with no extra
 * scope (so a token cannot reach mail through a batch), and never a batch.
 */
function batchRefusal(op: OpDefinition | undefined, name: string) {
  if (!op) return `Unknown operation ${name}`;
  if (name.startsWith("batch.") || name.startsWith("item.")) {
    return "Batches cannot be nested";
  }
  if (op.risk !== "reversible") {
    return `${name} cannot run in a batch (only reversible writes can)`;
  }
  if (op.scopes?.length) {
    return `${name} needs an extra scope and cannot run in a batch`;
  }
  return null;
}

/** Merges the touched rows of many steps: first "before", last "after" per row. */
function mergeTouched(rows: TouchedRow[]): TouchedRow[] {
  const merged = new Map<string, TouchedRow>();
  for (const row of rows) {
    const key = `${row.model}:${row.id}`;
    const first = merged.get(key);
    merged.set(
      key,
      first ? { ...row, beforeUpdatedAt: first.beforeUpdatedAt } : row
    );
  }
  return [...merged.values()];
}

/** A short, stable description of what a step changed, for the answer. */
function brief(result: unknown): unknown {
  if (!result || typeof result !== "object") return result ?? null;
  const record = result as Record<string, unknown>;
  for (const key of [
    "task",
    "page",
    "project",
    "habit",
    "event",
    "goal",
    "block",
  ]) {
    const entity = record[key];
    if (entity && typeof entity === "object") {
      const { id, title, name } = entity as Record<string, unknown>;
      return {
        id,
        ...(title !== undefined ? { title } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(record.changed === false ? { changed: false } : {}),
      };
    }
  }
  return record;
}

function failureOf(error: unknown) {
  if (error instanceof OpError) {
    return { code: error.code, error: error.message };
  }
  throw error;
}

/**
 * Runs steps in order. Steps whose op owns its transaction (pages) run after
 * the rest, outside the shared transaction; the rest run inside one, so an
 * `abort` rolls all of them back. Nothing outside the transaction is ever
 * aborted: a step that fails there is reported and the others still apply.
 */
async function runSteps(
  ctx: OpContext,
  lookup: OpLookup,
  steps: Step[],
  onError: "abort" | "skip"
): Promise<StepOutcome[]> {
  const outcomes: StepOutcome[] = new Array(steps.length);

  const prepared = steps.map((step, index) => {
    const found = lookup(step.op);
    // Inverse-only ops are not callable from outside, batches included.
    const op = found && !found.internal ? found : undefined;
    const refusal = batchRefusal(op, step.op);
    if (refusal || !op) {
      return { index, step, op: undefined, input: undefined, refusal };
    }
    const parsed = op.input.safeParse(step.input ?? {});
    return parsed.success
      ? { index, step, op, input: parsed.data as unknown, refusal: null }
      : {
          index,
          step,
          op: undefined,
          input: undefined,
          refusal: `Invalid input: ${parsed.error.issues
            .map(
              (issue) => `${issue.path.join(".") || "input"} ${issue.message}`
            )
            .join("; ")}`,
        };
  });

  const fail = (
    index: number,
    op: string,
    code: string,
    error: string
  ): StepOutcome => ({ index, ok: false, op, code, error });

  const inTransaction = prepared.filter(
    (item) => !item.op || item.op.transactional !== false
  );
  const loose = prepared.filter(
    (item) => item.op && item.op.transactional === false
  );

  const abort = (index: number, op: string, code: string, error: string) =>
    new OpError(
      code === "INVALID_INPUT" || code === "OP_NOT_FOUND"
        ? "INVALID_INPUT"
        : (code as OpError["code"]),
      `Step ${index + 1} (${op}): ${error}. Nothing was changed.`,
      { index, op }
    );

  await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const stepCtx: OpContext = { ...ctx, tx };
      for (const item of inTransaction) {
        if (!item.op) {
          const refusal = item.refusal ?? "Invalid step";
          const code = refusal.startsWith("Unknown")
            ? "OP_NOT_FOUND"
            : "INVALID_INPUT";
          if (onError === "abort") {
            throw abort(item.index, item.step.op, code, refusal);
          }
          outcomes[item.index] = fail(item.index, item.step.op, code, refusal);
          continue;
        }
        try {
          outcomes[item.index] = {
            index: item.index,
            ok: true,
            op: item.step.op,
            output: await item.op.run(stepCtx, item.input),
          };
        } catch (error) {
          const failure = failureOf(error);
          if (onError === "abort") {
            throw abort(item.index, item.step.op, failure.code, failure.error);
          }
          outcomes[item.index] = fail(
            item.index,
            item.step.op,
            failure.code,
            failure.error
          );
        }
      }
    },
    { timeout: BATCH_TX_TIMEOUT_MS, maxWait: 10_000 }
  );

  for (const item of loose) {
    if (!item.op) continue;
    try {
      outcomes[item.index] = {
        index: item.index,
        ok: true,
        op: item.step.op,
        output: await item.op.run(ctx, item.input),
      };
    } catch (error) {
      if (error instanceof OpError) {
        outcomes[item.index] = fail(
          item.index,
          item.step.op,
          error.code,
          error.message
        );
      } else {
        logger.error(
          "Batch step failed",
          {
            op: item.step.op,
            error: error instanceof Error ? error.message : String(error),
          },
          LOG_SOURCE
        );
        outcomes[item.index] = fail(
          item.index,
          item.step.op,
          "INTERNAL",
          "The step failed unexpectedly"
        );
      }
    }
  }
  return outcomes;
}

/** The output every composite op returns: results, one inverse, merged versions. */
function compose(
  outcomes: StepOutcome[],
  extra: (done: StepOutcome[]) => Record<string, unknown>
): OpRunOutput<Record<string, unknown>> {
  const done = outcomes.filter(
    (outcome): outcome is Extract<StepOutcome, { ok: true }> => outcome.ok
  );
  // Newest first, so undo peels the changes off in reverse order.
  const inverses = done
    .filter((outcome) => outcome.output.inverse)
    .map((outcome) => outcome.output.inverse as OpInverse)
    .reverse();
  return {
    result: extra(outcomes),
    before: { steps: done.map((outcome) => outcome.output.before ?? null) },
    inverse: inverses.length
      ? { op: "batch.restore", input: { items: inverses } }
      : null,
    touched: mergeTouched(
      done.flatMap((outcome) => outcome.output.touched ?? [])
    ),
    afterCommit: done.flatMap((outcome) => outcome.output.afterCommit ?? []),
  };
}

const stepSchema = z
  .object({
    op: z.string().trim().min(1).max(80),
    input: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

const onErrorSchema = z.enum(["abort", "skip"]).default("abort");

export function createBatchOps(lookup: OpLookup) {
  const batchRun = defineOp({
    name: "batch.run",
    description: `Run up to ${BATCH_MAX_ITEMS} reversible operations in one call, in order, as one write and one undo. Each step is { op, input } exactly as for that operation on its own (task.update, task.complete, task.create, project.update, ...). onError "abort" (default) rolls everything back at the first failing step; "skip" applies the steps that work and lists the ones that failed. Page operations run after the rest, on their own, and are always reported per step. Undo reverses every applied step.`,
    risk: "reversible",
    transactional: false,
    input: z
      .object({
        operations: z.array(stepSchema).min(1).max(BATCH_MAX_ITEMS),
        onError: onErrorSchema,
      })
      .strict(),
    async run(ctx, input) {
      const outcomes = await runSteps(
        ctx,
        lookup,
        input.operations,
        input.onError
      );
      return compose(outcomes, (all) => ({
        applied: all.filter((outcome) => outcome.ok).length,
        failed: all.filter((outcome) => !outcome.ok).length,
        results: all.map((outcome) =>
          outcome.ok
            ? {
                index: outcome.index,
                op: outcome.op,
                ok: true,
                result: brief(outcome.output.result),
              }
            : {
                index: outcome.index,
                op: outcome.op,
                ok: false,
                code: outcome.code,
                error: outcome.error,
              }
        ),
      }));
    },
  });

  const itemDelete = defineOp({
    name: "item.delete",
    description: `Delete up to ${BATCH_MAX_ITEMS} things in one call, each kept so it can be brought back: a task or page goes to Trash (30 days), a project, habit or goal is archived, an event of a Needt calendar is hidden (synced Google/Outlook events cannot be deleted here). items is a list of { type, id }, type being ${DELETE_ITEM_TYPES.join(", ")}. An id that is not yours, or not found, is reported in failed and the rest still go. One actionId undoes the whole call.`,
    risk: "reversible",
    transactional: false,
    input: z
      .object({
        items: z
          .array(
            z
              .object({
                type: z.enum(DELETE_ITEM_TYPES),
                id: z.string().trim().min(1).max(200),
              })
              .strict()
          )
          .min(1)
          .max(BATCH_MAX_ITEMS),
      })
      .strict(),
    async run(ctx, input) {
      const seen = new Set<string>();
      const items = input.items.filter((item) => {
        const key = `${item.type}:${item.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const steps = items.map((item) => ({
        op: DELETE_STEP[item.type].op,
        input: { [DELETE_STEP[item.type].key]: item.id },
      }));
      const outcomes = await runSteps(ctx, lookup, steps, "skip");
      return compose(outcomes, (all) => {
        const deleted: unknown[] = [];
        const failed: unknown[] = [];
        for (const outcome of all) {
          const item = items[outcome.index];
          if (outcome.ok) {
            const summary = brief(outcome.output.result) as Record<
              string,
              unknown
            >;
            deleted.push({
              type: item.type,
              id: item.id,
              ...(summary?.title !== undefined ? { title: summary.title } : {}),
              ...(summary?.name !== undefined ? { title: summary.name } : {}),
              ...(summary?.changed === false ? { alreadyDeleted: true } : {}),
            });
          } else {
            failed.push({
              type: item.type,
              id: item.id,
              code: outcome.code,
              error: outcome.error,
            });
          }
        }
        return {
          deleted,
          failed,
          counts: { deleted: deleted.length, failed: failed.length },
        };
      });
    },
  });

  const batchRestore = defineOp({
    name: "batch.restore",
    description:
      "Run stored inverses in order, as one undo. Used only by undo.",
    risk: "reversible",
    internal: true,
    input: z
      .object({
        items: z
          .array(
            z
              .object({
                op: z.string().min(1),
                input: z.record(z.string(), z.unknown()),
              })
              .strict()
          )
          .min(1)
          .max(BATCH_MAX_ITEMS * 4),
      })
      .strict(),
    async run(ctx, input) {
      const outputs: OpRunOutput<unknown>[] = [];
      for (const item of input.items) {
        const op = lookup(item.op);
        if (!op)
          throw new OpError("OP_NOT_FOUND", `Unknown inverse ${item.op}`);
        const parsed = op.input.safeParse(item.input);
        if (!parsed.success) {
          throw new OpError("INVALID_INPUT", "Invalid stored inverse");
        }
        outputs.push(await op.run(ctx, parsed.data));
      }
      const inverses = outputs
        .map((output) => output.inverse)
        .filter((inverse): inverse is OpInverse => Boolean(inverse))
        .reverse();
      return {
        result: { restored: outputs.length },
        before: null,
        inverse: inverses.length
          ? { op: "batch.restore", input: { items: inverses } }
          : null,
        touched: mergeTouched(
          outputs.flatMap((output) => output.touched ?? [])
        ),
        afterCommit: outputs.flatMap((output) => output.afterCommit ?? []),
      };
    },
  });

  return [batchRun, itemDelete, batchRestore];
}
