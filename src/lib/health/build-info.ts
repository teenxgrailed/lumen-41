import { resolveBuildSha } from "@/lib/health/build-sha";
import { readWorkerReleaseBuildSha } from "@/lib/health/worker-release";

const WORKER_LOOKUP_TIMEOUT_MS = 1_000;

export interface BuildInfo {
  buildSha: string;
  /** The SHA the worker last reported for this release, or null when it has not. */
  workerBuildSha: string | null;
}

/**
 * The app and worker build SHAs, read the way `/api/health` reads them. The
 * worker lookup is bounded: a slow Redis answers null, never a hung page.
 */
export async function readBuildInfo(): Promise<BuildInfo> {
  const buildSha = resolveBuildSha();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const workerBuildSha = await Promise.race([
      readWorkerReleaseBuildSha(buildSha),
      new Promise<null>((resolve) => {
        timeout = setTimeout(resolve, WORKER_LOOKUP_TIMEOUT_MS, null);
        timeout.unref();
      }),
    ]);
    return { buildSha, workerBuildSha };
  } catch {
    return { buildSha, workerBuildSha: null };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
