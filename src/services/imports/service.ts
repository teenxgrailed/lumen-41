import { encryptSecret } from "@/services/ai/encryption";
import type { ImportRun, ImportSource, Prisma } from "@prisma/client";
import crypto from "crypto";

import { authSecret } from "@/lib/auth/auth-secret";
import { newDate } from "@/lib/date-utils";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { enqueueImportRun } from "@/lib/queue/enqueue";

import { getTodoistOAuthConfig } from "./todoist/client";
import { type ImportCounts, type ImportWarning, emptyCounts } from "./types";

const LOG_SOURCE = "ImportService";

export const IMPORTS_FEATURE_FLAG = "imports";
export const IMPORT_SOURCES = ["todoist"] as const;
export type SupportedImportSource = (typeof IMPORT_SOURCES)[number];

/** A run still queued or running after this long is treated as abandoned. */
const ACTIVE_RUN_WINDOW_MS = 2 * 60 * 60 * 1_000;

export function importsEnabled(userId: string) {
  return isFeatureEnabled(IMPORTS_FEATURE_FLAG, userId);
}

export function importSourceConfigured(source: SupportedImportSource) {
  return source === "todoist" && getTodoistOAuthConfig() !== null;
}

/* ---------- OAuth state ---------- */

export const IMPORT_STATE_COOKIE = "needt_import_oauth";
export const IMPORT_STATE_TTL_SECONDS = 10 * 60;

interface StatePayload {
  n: string; // nonce, also held in an httpOnly cookie
  w: string; // workspace the run lands in
  e: number; // expiry, epoch ms
}

function sign(userId: string, payload: string) {
  return crypto
    .createHmac("sha256", authSecret())
    .update(`import-oauth:${userId}:${payload}`)
    .digest("base64url");
}

/**
 * State for the provider's redirect: signed for the signed-in user (so it
 * cannot be replayed into another session) and paired with a nonce cookie
 * (so a link someone else started cannot be completed in this browser).
 */
export function createImportOAuthState(userId: string, workspaceId: string) {
  const nonce = crypto.randomBytes(16).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      n: nonce,
      w: workspaceId,
      e: newDate().getTime() + IMPORT_STATE_TTL_SECONDS * 1_000,
    } satisfies StatePayload)
  ).toString("base64url");
  return { state: `${payload}.${sign(userId, payload)}`, nonce };
}

export function verifyImportOAuthState(
  state: string | null,
  userId: string,
  cookieNonce: string | undefined
): { workspaceId: string } | null {
  if (!state || !cookieNonce) return null;
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(userId, payload));
  const given = Buffer.from(signature);
  if (
    expected.length !== given.length ||
    !crypto.timingSafeEqual(expected, given)
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as Partial<StatePayload>;
    if (
      typeof parsed.n !== "string" ||
      typeof parsed.w !== "string" ||
      typeof parsed.e !== "number" ||
      parsed.e < newDate().getTime() ||
      parsed.n !== cookieNonce
    ) {
      return null;
    }
    return { workspaceId: parsed.w };
  } catch {
    return null;
  }
}

/* ---------- runs ---------- */

export interface ImportRunView {
  id: string;
  source: ImportSource;
  status: ImportRun["status"];
  counts: ImportCounts;
  warnings: ImportWarning[];
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

function readCounts(value: Prisma.JsonValue): ImportCounts {
  const base = emptyCounts();
  if (!value || typeof value !== "object" || Array.isArray(value)) return base;
  const v = value as Record<string, unknown>;
  for (const key of Object.keys(base) as Array<keyof ImportCounts>) {
    if (typeof v[key] === "number") base[key] = v[key] as number;
  }
  return base;
}

function readWarnings(value: Prisma.JsonValue[] | null): ImportWarning[] {
  return (value ?? []).flatMap((w) =>
    w &&
    typeof w === "object" &&
    !Array.isArray(w) &&
    typeof (w as Record<string, unknown>).message === "string"
      ? [w as unknown as ImportWarning]
      : []
  );
}

/** The public shape of a run. Never carries the token. */
export function serializeImportRun(run: ImportRun): ImportRunView {
  return {
    id: run.id,
    source: run.source,
    status: run.status,
    counts: readCounts(run.counts),
    warnings: readWarnings(run.warnings),
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
  };
}

export function findActiveImportRun(userId: string, source: ImportSource) {
  return prisma.importRun.findFirst({
    where: {
      userId,
      source,
      status: { in: ["queued", "running"] },
      createdAt: { gte: newDate(newDate().getTime() - ACTIVE_RUN_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function listImportRuns(userId: string, take = 5) {
  return prisma.importRun.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** Owner-only read: another user's run is indistinguishable from none. */
export function getImportRunForUser(id: string, userId: string) {
  return prisma.importRun.findFirst({ where: { id, userId } });
}

/**
 * Creates a queued run holding the encrypted token and hands it to the
 * worker. When no worker queue is configured the run fails at once (and the
 * token is not kept) rather than sitting in "queued" forever.
 */
export async function createImportRun(input: {
  userId: string;
  workspaceId: string;
  source: SupportedImportSource;
  token: string;
}): Promise<ImportRun> {
  const run = await prisma.importRun.create({
    data: {
      userId: input.userId,
      workspaceId: input.workspaceId,
      source: input.source,
      status: "queued",
      encryptedToken: encryptSecret(input.token),
    },
  });
  try {
    const job = await enqueueImportRun(run.id);
    if (job) return run;
    return await failRun(run.id, {
      code: "worker_unavailable",
      message:
        "This server has no background worker configured, so the import could not start.",
    });
  } catch (error) {
    await logger.error(
      "Could not enqueue import run",
      {
        importRunId: run.id,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return failRun(run.id, {
      code: "worker_unavailable",
      message: "The import could not be queued. Try again in a minute.",
    });
  }
}

export function failRun(id: string, warning: ImportWarning) {
  return prisma.importRun.update({
    where: { id },
    data: {
      status: "failed",
      finishedAt: newDate(),
      encryptedToken: null,
      warnings: { push: warning as unknown as Prisma.InputJsonValue },
    },
  });
}

/** Cancels a queued or running run; the worker stops at its next check. */
export async function cancelImportRun(id: string, userId: string) {
  const updated = await prisma.importRun.updateMany({
    where: { id, userId, status: { in: ["queued", "running"] } },
    data: { status: "cancelled", finishedAt: newDate(), encryptedToken: null },
  });
  const run = await getImportRunForUser(id, userId);
  return { run, cancelled: updated.count === 1 };
}
