import type { HubItem } from "@prisma/client";

import { newDate } from "@/lib/date-utils";

import {
  OCCURRENCE_LEASE_MS,
  OCCURRENCE_WAITING_CAP_MS,
  TERMINAL_STATUSES,
} from "./constants";

/**
 * The lease of an occurrence of a repeating item (HubItem.occurrenceExpiresAt).
 * Kept apart from recurrences.ts so items.ts can set it on a status change
 * without an import cycle.
 *
 * - Active (open, claimed, in_progress): 24 hours after it opened, or until
 *   the next fire if sooner.
 * - Waiting (needs_owner, blocked): 7 days from the moment it started waiting.
 *   Until then it keeps blocking the next run; after that the hub closes it
 *   as missed and alerts the owner.
 * - Leaving a waiting state starts a fresh 24 hours.
 */

/** Statuses in which an occurrence waits on someone rather than runs. */
export const WAITING_STATUSES: readonly string[] = ["needs_owner", "blocked"];

/**
 * When the lease of an occurrence opened at `openedAt` ends: 24 hours later,
 * or at the next fire when that comes sooner (null: the series has no more).
 */
export function occurrenceLeaseEnd(
  openedAt: Date,
  nextFire: Date | null
): Date {
  const cap = newDate(openedAt.getTime() + OCCURRENCE_LEASE_MS);
  return nextFire && nextFire.getTime() < cap.getTime() ? nextFire : cap;
}

/** The end of the lease of an occurrence that starts waiting at `now`. */
export function waitingLeaseEnd(now: Date): Date {
  return newDate(now.getTime() + OCCURRENCE_WAITING_CAP_MS);
}

/**
 * The lease column to write when an item moves from `from` to `to`: a waiting
 * state starts the 7 day cap, leaving one starts a fresh 24 hours, anything
 * else leaves the lease alone. Empty for an item that is not an occurrence.
 */
export function leaseOnTransition(
  item: Pick<HubItem, "recurrenceId">,
  from: string,
  to: string,
  now: Date
): { occurrenceExpiresAt?: Date } {
  if (!item.recurrenceId) return {};
  const waitsNow = WAITING_STATUSES.includes(to);
  const waitedBefore = WAITING_STATUSES.includes(from);
  if (waitsNow && !waitedBefore) {
    return { occurrenceExpiresAt: waitingLeaseEnd(now) };
  }
  if (waitedBefore && !waitsNow) {
    return { occurrenceExpiresAt: occurrenceLeaseEnd(now, null) };
  }
  return {};
}

export type LeasedItem = Pick<
  HubItem,
  | "status"
  | "createdAt"
  | "updatedAt"
  | "occurrenceAt"
  | "occurrenceExpiresAt"
  | "leaseExpiresAt"
>;

/**
 * When an occurrence's lease ends. A row from before leases existed has none
 * stored: an active one gets the plain 24 hours from when it opened, a waiting
 * one the 7 day cap from its last change.
 */
export function occurrenceEnd(item: LeasedItem): Date {
  if (item.occurrenceExpiresAt) return item.occurrenceExpiresAt;
  //todo: drop this fallback (contract step) once no unfinished recurring
  // item has a null occurrenceExpiresAt; it covers rows written by a server
  // that predates the lease during a rolling deploy.
  if (WAITING_STATUSES.includes(item.status)) {
    return newDate(item.updatedAt.getTime() + OCCURRENCE_WAITING_CAP_MS);
  }
  const openedAt = item.occurrenceAt ?? item.createdAt;
  return newDate(openedAt.getTime() + OCCURRENCE_LEASE_MS);
}

/**
 * True when an unfinished occurrence has outlived its lease and may be closed
 * as missed. Never while an agent holds it under a live claim lease (the claim
 * lease, at most 240 minutes per renewal, bounds that). An item waiting on the
 * owner or blocked is closed only after the 7 day cap.
 */
export function occurrenceExpired(item: LeasedItem, now: Date): boolean {
  if (TERMINAL_STATUSES.includes(item.status)) return false;
  if (occurrenceEnd(item).getTime() > now.getTime()) return false;
  const working =
    ["claimed", "in_progress", "blocked"].includes(item.status) &&
    item.leaseExpiresAt !== null &&
    item.leaseExpiresAt.getTime() > now.getTime();
  return !working;
}
