import { DelayedError } from "bullmq";

import { newDate } from "@/lib/date-utils";

export const TRAILING_JOB_SUFFIX = "-next";
/** How long a trailing job waits before checking its primary job again. */
export const TRAILING_RECHECK_DELAY_MS = 10_000;

interface TrailingJob {
  id?: string;
  moveToDelayed: (timestamp: number, token?: string) => Promise<void>;
}

interface PrimaryLookup {
  getJob: (
    id: string
  ) => Promise<{ isActive: () => Promise<boolean> } | null | undefined>;
}

/**
 * A trailing job (`<id>-next`) exists to run after the primary `<id>` job has
 * finished. With worker concurrency above one it can be picked up while the
 * primary is still running, and two runs for one feed or user would race. Push
 * it back until the primary is no longer active. Throws BullMQ's DelayedError
 * once moved, which the processor must let propagate.
 */
export async function deferTrailingJob(
  job: TrailingJob,
  token: string | undefined,
  queue: PrimaryLookup
) {
  const id = job.id;
  if (!id || !id.endsWith(TRAILING_JOB_SUFFIX)) return;
  const primary = await queue.getJob(id.slice(0, -TRAILING_JOB_SUFFIX.length));
  if (!primary || !(await primary.isActive())) return;
  await job.moveToDelayed(
    newDate().getTime() + TRAILING_RECHECK_DELAY_MS,
    token
  );
  throw new DelayedError();
}
