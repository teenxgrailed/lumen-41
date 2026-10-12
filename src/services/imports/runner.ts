import { decryptSecret } from "@/services/ai/encryption";
import type { Prisma } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime/publish";

import { addWarning, applyImportPlan } from "./apply";
import { createPlanLimitGuard, createPrismaImportStore } from "./prisma-store";
import { TodoistApiError, fetchTodoistSnapshot } from "./todoist/client";
import { planTodoistImport } from "./todoist/mapper";
import type { TodoistSnapshot } from "./todoist/types";
import {
  ImportCancelledError,
  type ImportCounts,
  type ImportLimitGuard,
  type ImportStore,
  type ImportWarning,
} from "./types";

const LOG_SOURCE = "ImportRunner";

export interface ImportRunnerDeps {
  fetchTodoistSnapshot: (token: string) => Promise<TodoistSnapshot>;
  createStore: typeof createPrismaImportStore;
  createGuard: (userId: string) => ImportLimitGuard;
}

const defaultDeps: ImportRunnerDeps = {
  fetchTodoistSnapshot: (token) => fetchTodoistSnapshot(token),
  createStore: createPrismaImportStore,
  createGuard: () => createPlanLimitGuard(),
};

function json<T>(value: T) {
  return value as unknown as Prisma.InputJsonValue;
}

/**
 * Runs one import from the worker. The job carries only the run id; the
 * token is read from the row, decrypted in memory, and the column is set to
 * null whatever happens (done, failed, cancelled or a thrown error).
 */
export async function processImportRun(
  importRunId: string,
  deps: ImportRunnerDeps = defaultDeps
): Promise<void> {
  const run = await prisma.importRun.findUnique({ where: { id: importRunId } });
  if (!run) return;

  const claimed = await prisma.importRun.updateMany({
    where: { id: run.id, status: "queued" },
    data: { status: "running", startedAt: newDate() },
  });
  if (claimed.count !== 1) {
    // Cancelled (or already handled) before the worker got to it.
    await prisma.importRun.updateMany({
      where: { id: run.id, encryptedToken: { not: null } },
      data: { encryptedToken: null },
    });
    return;
  }

  let counts: ImportCounts | null = null;
  let warnings: ImportWarning[] = [];
  try {
    const token = decryptSecret(run.encryptedToken);
    if (!token) {
      throw new TodoistApiError(
        "unauthorized",
        "The import lost its access to Todoist. Connect again and retry."
      );
    }
    if (run.source !== "todoist") {
      throw new Error(`Import source ${run.source} is not supported yet`);
    }

    const snapshot = await deps.fetchTodoistSnapshot(token);
    const plan = planTodoistImport(snapshot);
    const store: ImportStore = deps.createStore({
      userId: run.userId,
      workspaceId: run.workspaceId,
      source: run.source,
      importRunId: run.id,
    });

    const result = await applyImportPlan(
      plan,
      store,
      deps.createGuard(run.userId),
      {
        onProgress: async (progress, current) => {
          counts = progress;
          warnings = current;
          await prisma.importRun.updateMany({
            where: { id: run.id, status: "running" },
            data: {
              counts: json(progress),
              warnings: { set: current.map(json) },
            },
          });
        },
        isCancelled: async () => {
          const row = await prisma.importRun.findUnique({
            where: { id: run.id },
            select: { status: true },
          });
          return row?.status === "cancelled";
        },
      }
    );

    await prisma.importRun.updateMany({
      where: { id: run.id, status: "running" },
      data: {
        status: "done",
        finishedAt: newDate(),
        encryptedToken: null,
        counts: json(result.counts),
        warnings: { set: result.warnings.map(json) },
      },
    });
    await logger.info(
      "Import run finished",
      { importRunId: run.id, ...result.counts },
      LOG_SOURCE
    );
  } catch (error) {
    if (error instanceof ImportCancelledError) {
      await prisma.importRun.update({
        where: { id: run.id },
        data: {
          encryptedToken: null,
          ...(counts ? { counts: json(counts) } : {}),
          warnings: { set: warnings.map(json) },
        },
      });
      return;
    }
    const failure: ImportWarning =
      error instanceof TodoistApiError
        ? { code: `todoist_${error.code}`, message: error.message }
        : {
            code: "import_failed",
            message: "The import stopped because of an unexpected error.",
          };
    addWarning(warnings, failure);
    await prisma.importRun.updateMany({
      where: { id: run.id, status: "running" },
      data: {
        status: "failed",
        finishedAt: newDate(),
        encryptedToken: null,
        ...(counts ? { counts: json(counts) } : {}),
        warnings: { set: warnings.map(json) },
      },
    });
    await logger.error(
      "Import run failed",
      {
        importRunId: run.id,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
  } finally {
    // Belt and braces: whichever branch ran, the token does not outlive it.
    await prisma.importRun.updateMany({
      where: { id: run.id, encryptedToken: { not: null } },
      data: { encryptedToken: null },
    });
    await publishRealtimeEvent(run.userId, "tasks-updated").catch(
      () => undefined
    );
  }
}
