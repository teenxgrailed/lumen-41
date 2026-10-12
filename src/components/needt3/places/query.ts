import type { ScreenQuery } from "../states/status";

/**
 * One query for a screen that reads several (Trash lists tasks and boards).
 * It is an error if any failed, loading until all have data, and `refetch`
 * retries the ones that did not succeed.
 */
export function mergeQueries(queries: readonly ScreenQuery[]): ScreenQuery {
  const failed = queries.find((q) => q.status === "error");
  const hasAll = queries.every((q) => q.data !== undefined);
  return {
    status: failed
      ? "error"
      : queries.every((q) => q.status === "success")
        ? "success"
        : "pending",
    fetchStatus: queries.some((q) => q.fetchStatus === "paused")
      ? "paused"
      : queries.some((q) => q.fetchStatus === "fetching")
        ? "fetching"
        : "idle",
    // Cached content wins in StScreen, but only once every part has some.
    data: hasAll ? queries.map((q) => q.data) : undefined,
    error: failed?.error ?? null,
    refetch: () =>
      Promise.all(
        queries.filter((q) => q.status !== "success").map((q) => q.refetch())
      ),
  };
}
