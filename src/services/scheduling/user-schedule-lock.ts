import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * A scheduling run reads the calendar and every auto-scheduled task, plans the
 * whole set from scratch, then deletes and rewrites their blocks. Two runs for
 * one person that overlap in time (tasks created back to back through the
 * connector, the worker's reschedule job landing at the same moment) each plan
 * against the other's old state and write interleaved blocks, so tasks end up
 * in the same slot.
 *
 * Runs for one person are therefore serial: an in-process queue keeps one
 * process from holding a database connection per waiting run, and a Postgres
 * advisory lock, held by a transaction for the length of the run, serialises
 * the web app against the worker.
 */

const tails = new Map<string, Promise<void>>();

// A run plans up to 21 days of tasks; the default 5 s transaction timeout
// would kill the lock holder part-way through.
const LOCK_WAIT_MS = 30_000;
const LOCK_HOLD_MS = 120_000;

export async function withUserScheduleLock<T>(
  userId: string,
  run: () => Promise<T>
): Promise<T> {
  const previous = tails.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => mine);
  tails.set(userId, tail);

  await previous;
  try {
    return await prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`needt-schedule:${userId}`}, 0))`
        );
        return run();
      },
      { maxWait: LOCK_WAIT_MS, timeout: LOCK_HOLD_MS }
    );
  } finally {
    release();
    if (tails.get(userId) === tail) tails.delete(userId);
  }
}
