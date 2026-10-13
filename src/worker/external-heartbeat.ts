import { logger } from "@/lib/logger";

const LOG_SOURCE = "WorkerExternalHeartbeat";
export const EXTERNAL_HEARTBEAT_TIMEOUT_MS = 5_000;

type FetchImpl = (
  input: string,
  init?: { method?: string; signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number }>;

/**
 * Tell an external uptime monitor that the worker is alive. A monitor that is
 * down or slow must never take the worker with it, so this never throws.
 */
export async function pingExternalHeartbeat(
  url: string,
  fetchImpl: FetchImpl = fetch
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    EXTERNAL_HEARTBEAT_TIMEOUT_MS
  );
  timeout.unref?.();
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      await logger
        .warn(
          "External heartbeat answered with an error",
          { status: response.status },
          LOG_SOURCE
        )
        .catch(() => undefined);
      return false;
    }
    return true;
  } catch (error) {
    await logger
      .warn(
        "External heartbeat failed",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      )
      .catch(() => undefined);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Ping NEEDT_HEARTBEAT_URL now and on every interval tick. Returns null when
 * the variable is unset, so environments without a monitor do nothing.
 */
export function startExternalHeartbeat(
  intervalMs: number,
  url: string | undefined = process.env.NEEDT_HEARTBEAT_URL,
  fetchImpl: FetchImpl = fetch
): ReturnType<typeof setInterval> | null {
  const target = url?.trim();
  if (!target) return null;
  void pingExternalHeartbeat(target, fetchImpl);
  const interval = setInterval(() => {
    void pingExternalHeartbeat(target, fetchImpl);
  }, intervalMs);
  interval.unref?.();
  return interval;
}
