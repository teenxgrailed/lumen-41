import type { Prisma } from "@prisma/client";
import type { z } from "zod";

import type {
  WorkspaceAccess,
  WorkspaceDataScope,
} from "@/lib/auth/workspace-auth";

/**
 * `read` never writes. `reversible` writes and stores an inverse, so the
 * change can be undone from the action log. `irreversible` writes without an
 * inverse (sending mail, hard delete); callers must confirm before running it.
 */
export type OpRisk = "read" | "reversible" | "irreversible";

export type OpActor = "user" | "agent" | "mcp";

/** Prisma client inside `$transaction`, or the root client for ops that run their own work. */
export type OpClient = Prisma.TransactionClient;

export interface OpContext {
  userId: string;
  workspaceId: string;
  workspace: WorkspaceAccess;
  /** Where-fragment that limits workspace-owned rows to this workspace (or legacy user scope). */
  scope: { workspaceId: string } | { userId: string };
  actor: OpActor;
  tx: OpClient;
  runId?: string | null;
}

/**
 * A row an op changed: the version it found (`beforeUpdatedAt`, null for a
 * row the op created) and the version it left (`updatedAt`). Undo compares
 * the current version with `updatedAt`; the pair lets it tell its own run's
 * restores apart from someone else's edit.
 */
export interface TouchedRow {
  model: TouchedModel;
  id: string;
  updatedAt: string;
  beforeUpdatedAt: string | null;
}

export const TOUCHED_MODELS = [
  "task",
  "project",
  "habit",
  "scheduledBlock",
  "event",
  "page",
] as const;
export type TouchedModel = (typeof TOUCHED_MODELS)[number];

export interface OpInverse {
  op: string;
  input: Record<string, unknown>;
}

export interface OpRunOutput<Result> {
  result: Result;
  /** Snapshot of what the op replaced. Stored for audit; the inverse is what undo runs. */
  before?: unknown;
  inverse?: OpInverse | null;
  touched?: TouchedRow[];
  /** Side effects to run only after the transaction commits (pushes, webhooks). */
  afterCommit?: Array<() => Promise<void> | void>;
}

export interface OpDefinition<
  Schema extends z.ZodTypeAny = z.ZodTypeAny,
  Result = unknown,
> {
  name: string;
  description: string;
  input: Schema;
  risk: OpRisk;
  /**
   * Internal ops exist only as inverses (exact snapshot restores). They are
   * not listed or callable from outside; undo is the only caller.
   */
  internal?: boolean;
  /**
   * Ops that drive services owning their own transactions (the scheduler)
   * set this to false: `ctx.tx` is then the root client and the action row
   * is written after the op returns.
   */
  transactional?: boolean;
  run(ctx: OpContext, input: z.infer<Schema>): Promise<OpRunOutput<Result>>;
}

export function defineOp<Schema extends z.ZodTypeAny, Result>(
  definition: OpDefinition<Schema, Result>
): OpDefinition<Schema, Result> {
  return definition;
}

export type { WorkspaceAccess, WorkspaceDataScope };
