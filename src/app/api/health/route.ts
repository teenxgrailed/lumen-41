import { NextResponse } from "next/server";

import { isDraining } from "@/lib/drain";
import { isBuildShaAllowed, resolveBuildSha } from "@/lib/health/build-sha";
import { getMigrationStatus } from "@/lib/health/migrations";
import { readWorkerReleaseBuildSha } from "@/lib/health/worker-release";

export const runtime = "nodejs";
const WORKER_HEALTH_LOOKUP_TIMEOUT_MS = 1_000;

async function getWorkerBuildSha(buildSha: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readWorkerReleaseBuildSha(buildSha),
      new Promise<null>((resolve) => {
        timeout = setTimeout(resolve, WORKER_HEALTH_LOOKUP_TIMEOUT_MS, null);
        timeout.unref();
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function GET() {
  const startedAt = Date.now();
  if (isDraining()) {
    // Shutting down: tell the load balancer to stop sending new traffic.
    return NextResponse.json({ ok: false, draining: true }, { status: 503 });
  }
  const buildSha = resolveBuildSha();
  if (!isBuildShaAllowed(buildSha)) {
    return NextResponse.json(
      {
        ok: false,
        db: "unchecked",
        buildSha,
        workerBuildSha: null,
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 }
    );
  }

  try {
    const [{ pending }, workerBuildSha] = await Promise.all([
      getMigrationStatus(),
      getWorkerBuildSha(buildSha),
    ]);

    if (pending.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          db: "migrations-pending",
          buildSha,
          workerBuildSha,
          latencyMs: Date.now() - startedAt,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      db: "ok",
      buildSha,
      workerBuildSha,
      latencyMs: Date.now() - startedAt,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        db: "error",
        buildSha,
        workerBuildSha: null,
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 }
    );
  }
}
