import { NextResponse } from "next/server";

import { z } from "zod";

import {
  IMPORT_SOURCES,
  IMPORT_SOURCE_LABEL,
  type SupportedImportSource,
  cancelImportRun,
  createImportRun,
  findActiveImportRun,
  getImportRunForUser,
  importSourceConfigured,
  importsEnabled,
  listImportRuns,
  serializeImportRun,
} from "./service";

/**
 * Route bodies shared by the session API (/api/imports) and the connector
 * API (/api/connect/imports): both resolve a user and a workspace, then land
 * here, so the two surfaces cannot drift apart.
 */

const startSchema = z.object({
  source: z.enum(IMPORT_SOURCES),
  /**
   * A personal token, for scripts that skip the OAuth step: a Todoist
   * personal API token, or a Notion internal integration token.
   */
  token: z.string().trim().min(1).max(512).optional(),
});

const notAvailable = () =>
  NextResponse.json(
    { error: "Imports are not available", code: "IMPORTS_DISABLED" },
    { status: 404 }
  );

const notFound = () =>
  NextResponse.json({ error: "Import not found" }, { status: 404 });

export async function listImportsResponse(userId: string) {
  const enabled = await importsEnabled(userId);
  if (!enabled) {
    return NextResponse.json({ enabled: false, sources: {}, runs: [] });
  }
  const runs = await listImportRuns(userId);
  return NextResponse.json({
    enabled: true,
    sources: {
      todoist: { configured: importSourceConfigured("todoist") },
      notion: { configured: importSourceConfigured("notion") },
    },
    runs: runs.map(serializeImportRun),
  });
}

export async function startImportResponse(input: {
  userId: string;
  workspaceId: string;
  body: unknown;
  /** Absolute URL of /api/imports/<source>/authorize on this deployment. */
  authorizeUrl: (workspaceId: string, source: SupportedImportSource) => string;
}) {
  if (!(await importsEnabled(input.userId))) return notAvailable();
  const parsed = startSchema.safeParse(input.body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'source must be "todoist" or "notion"',
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }
  const { source, token } = parsed.data;

  const active = await findActiveImportRun(input.userId, source);
  if (active) {
    return NextResponse.json(
      {
        error: "An import from this source is already running",
        code: "IMPORT_IN_PROGRESS",
        run: serializeImportRun(active),
      },
      { status: 409 }
    );
  }

  if (token) {
    const run = await createImportRun({
      userId: input.userId,
      workspaceId: input.workspaceId,
      source,
      token,
    });
    return NextResponse.json({ run: serializeImportRun(run) }, { status: 202 });
  }

  if (!importSourceConfigured(source)) {
    return NextResponse.json(
      {
        error: `${IMPORT_SOURCE_LABEL[source]} import is not configured on this server`,
        code: "NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }
  return NextResponse.json({
    authorizeUrl: input.authorizeUrl(input.workspaceId, source),
  });
}

export async function getImportResponse(userId: string, id: string) {
  if (!(await importsEnabled(userId))) return notAvailable();
  const run = await getImportRunForUser(id, userId);
  if (!run) return notFound();
  return NextResponse.json({ run: serializeImportRun(run) });
}

export async function cancelImportResponse(userId: string, id: string) {
  if (!(await importsEnabled(userId))) return notAvailable();
  const { run, cancelled } = await cancelImportRun(id, userId);
  if (!run) return notFound();
  if (!cancelled) {
    return NextResponse.json(
      {
        error: "Only a queued or running import can be cancelled",
        code: "IMPORT_FINISHED",
        run: serializeImportRun(run),
      },
      { status: 409 }
    );
  }
  return NextResponse.json({ run: serializeImportRun(run) });
}
