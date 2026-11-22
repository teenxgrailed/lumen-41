import { NextResponse } from "next/server";

import { isDraining } from "@/lib/drain";
import { isBuildShaAllowed, resolveBuildSha } from "@/lib/health/build-sha";
import { getAgentHubFlag } from "@/lib/health/flags";
import { getMigrationStatus } from "@/lib/health/migrations";
import { checkRedis } from "@/lib/health/redis";
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
        redis: "unchecked",
        buildSha,
        workerBuildSha: null,
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 }
    );
  }

  try {
    // Redis has its own 1 s timeout and never rejects, so it cannot slow the
    // database checks down or turn into a "db: error".
    const [{ pending }, workerBuildSha, agentHub, redis] = await Promise.all([
      getMigrationStatus(),
      getWorkerBuildSha(buildSha),
      getAgentHubFlag(),
      checkRedis(),
    ]);

    if (pending.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          db: "migrations-pending",
          redis,
          buildSha,
          workerBuildSha,
          latencyMs: Date.now() - startedAt,
        },
        { status: 503 }
      );
    }

    // Redis is reported, never gating: this endpoint is the container and
    // proxy healthcheck, and a Redis blip must not take the web container out
    // of rotation (a partial outage would become a full one).
    return NextResponse.json({
      ok: true,
      db: "ok",
      redis,
      ...(redis !== "ok" ? { degraded: true } : {}),
      buildSha,
      workerBuildSha,
      flags: { agent_hub: agentHub },
      latencyMs: Date.now() - startedAt,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        db: "error",
        redis: "unchecked",
        buildSha,
        workerBuildSha: null,
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 }
    );
  }
}
