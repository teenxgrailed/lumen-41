import type { HubReservation } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import {
  RESERVATION_DEFAULT_MINUTES,
  RESERVATION_MAX_MINUTES,
} from "./constants";
import type { AgentScope, WorkspaceKey } from "./context";
import { HubError } from "./errors";
import { agentNames } from "./items";
import type { ReleaseInput, ReserveInput } from "./schemas";
import { assertNoSecrets } from "./secret-scan";

/**
 * Advisory leases on shared resources (an account, a file glob). The hub
 * cannot stop an action taken outside Needt: an agent that reserves first and
 * releases after is what makes two of them stay out of each other's way.
 */

const RESOURCE_FORMAT = /^[a-z][a-z0-9_-]{0,30}:\S.*$/;
const GLOB_CHARS = /[*?[\]{}]/;

export function normalizeResource(raw: string): string {
  const resource = raw.trim();
  if (!RESOURCE_FORMAT.test(resource)) {
    throw new HubError(
      "INVALID",
      'resource must look like kind:name, with a lowercase kind (for example "instagram:@needt.app", "account:hello@needt.app" or "file:src/app/**").',
      { field: "resource" }
    );
  }
  const colon = resource.indexOf(":");
  const kind = resource.slice(0, colon);
  const name = resource.slice(colon + 1).trim();
  // Names compare case-insensitively; file paths keep their case.
  return kind === "file" ? `file:${name}` : `${kind}:${name.toLowerCase()}`;
}

/** Whether a literal `text` matches a one-segment glob (`*` and `?` only). */
function segmentMatches(glob: string, text: string): boolean {
  let g = 0;
  let t = 0;
  let star = -1;
  let mark = 0;
  while (t < text.length) {
    if (g < glob.length && (glob[g] === "?" || glob[g] === text[t])) {
      g++;
      t++;
    } else if (g < glob.length && glob[g] === "*") {
      star = g++;
      mark = t;
    } else if (star >= 0) {
      g = star + 1;
      t = ++mark;
    } else {
      return false;
    }
  }
  while (g < glob.length && glob[g] === "*") g++;
  return g === glob.length;
}

/** Whether two path segments (each a literal or a glob) can match the same name. */
function segmentsOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  const aGlob = GLOB_CHARS.test(a);
  const bGlob = GLOB_CHARS.test(b);
  if (aGlob && bGlob) return true; // conservative: two patterns may meet
  if (aGlob) return segmentMatches(a, b);
  if (bGlob) return segmentMatches(b, a);
  return false;
}

/** Whether two file globs can match a common path. Conservative on `**`. */
export function globsOverlap(a: string, b: string): boolean {
  const left = a.replace(/^\.?\//, "").split("/");
  const right = b.replace(/^\.?\//, "").split("/");
  const walk = (i: number, j: number): boolean => {
    if (i === left.length && j === right.length) return true;
    if (i < left.length && left[i] === "**") {
      // `**` eats zero or more segments of the other side.
      if (i === left.length - 1) return true;
      for (let k = j; k <= right.length; k++) if (walk(i + 1, k)) return true;
      return false;
    }
    if (j < right.length && right[j] === "**") {
      if (j === right.length - 1) return true;
      for (let k = i; k <= left.length; k++) if (walk(k, j + 1)) return true;
      return false;
    }
    if (i === left.length || j === right.length) return false;
    return segmentsOverlap(left[i], right[j]) && walk(i + 1, j + 1);
  };
  return walk(0, 0);
}

/** Whether two normalised resources name the same thing. */
export function resourcesOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.startsWith("file:") && b.startsWith("file:")) {
    return globsOverlap(a.slice(5), b.slice(5));
  }
  return false;
}

const active = (key: WorkspaceKey, now: Date) => ({
  userId: key.userId,
  workspaceId: key.workspaceId,
  releasedAt: null,
  expiresAt: { gt: now },
});

export function reservationView(
  row: HubReservation,
  names: Map<string, string>,
  selfId?: string
) {
  return {
    id: row.id,
    resource: row.resource,
    holder: {
      id: row.agentId,
      name: names.get(row.agentId) ?? "agent",
    },
    mine: row.agentId === selfId,
    reason: row.reason,
    exclusive: row.exclusive,
    expiresAt: row.expiresAt.toISOString(),
  };
}

async function viewRows(
  key: WorkspaceKey,
  rows: HubReservation[],
  selfId?: string
) {
  const names = await agentNames(
    key,
    rows.map((row) => row.agentId)
  );
  return rows.map((row) => reservationView(row, names, selfId));
}

/**
 * Reserve a resource for `ttlMinutes` (default 30, at most 240). Reserving
 * again what you already hold renews it. An exclusive reservation conflicts
 * with any other agent's active reservation that overlaps it, and any
 * exclusive reservation of another agent conflicts with a shared one.
 */
export async function reserve(scope: AgentScope, input: ReserveInput) {
  const resource = normalizeResource(input.resource);
  const reason = input.reason.trim();
  if (!reason) throw new HubError("INVALID", "reason cannot be empty.");
  assertNoSecrets({ resource, reason });
  const exclusive = input.exclusive ?? true;
  const minutes = Math.min(
    input.ttlMinutes ?? RESERVATION_DEFAULT_MINUTES,
    RESERVATION_MAX_MINUTES
  );
  const agent = scope.actor.agent;
  const now = newDate();
  const expiresAt = newDate(now.getTime() + minutes * 60 * 1000);

  const others = await prisma.hubReservation.findMany({
    where: { ...active(scope, now), agentId: { not: agent.id } },
  });
  const clash = others.find(
    (row) =>
      (exclusive || row.exclusive) && resourcesOverlap(resource, row.resource)
  );
  if (clash) {
    const [holder] = await viewRows(scope, [clash], agent.id);
    throw new HubError(
      "CONFLICT",
      `${holder.resource} is reserved by ${holder.holder.name} until ${holder.expiresAt}. Wait, pick another resource, or message them with needt_agent_message_send.`,
      {
        holder: holder.holder,
        resource: holder.resource,
        expiresAt: holder.expiresAt,
      }
    );
  }

  const mine = await prisma.hubReservation.findFirst({
    where: { ...active(scope, now), agentId: agent.id, resource },
  });
  const row = mine
    ? await prisma.hubReservation.update({
        where: { id: mine.id },
        data: { expiresAt, reason, exclusive },
      })
    : await prisma.hubReservation.create({
        data: {
          userId: scope.userId,
          workspaceId: scope.workspaceId,
          resource,
          agentId: agent.id,
          reason,
          exclusive,
          expiresAt,
        },
      });
  const [view] = await viewRows(scope, [row], agent.id);
  return { reservation: view, renewed: Boolean(mine) };
}

/** Release what the caller holds: one resource, one id, or (neither) all of it. */
export async function releaseReservation(
  scope: AgentScope,
  input: ReleaseInput
) {
  const now = newDate();
  const resource = input.resource
    ? normalizeResource(input.resource)
    : undefined;
  const done = await prisma.hubReservation.updateMany({
    where: {
      ...active(scope, now),
      agentId: scope.actor.agent.id,
      ...(resource ? { resource } : {}),
      ...(input.id ? { id: input.id } : {}),
    },
    data: { releasedAt: now },
  });
  return { released: done.count };
}

/** Everyone's active reservations in the workspace (expired and released ones are ignored). */
export async function listReservations(key: WorkspaceKey, selfId?: string) {
  const rows = await prisma.hubReservation.findMany({
    where: active(key, newDate()),
    orderBy: [{ expiresAt: "asc" }],
    take: 200,
  });
  return { reservations: await viewRows(key, rows, selfId) };
}

/** The caller's own active reservations, for the inbox. */
export async function myReservations(scope: AgentScope) {
  const rows = await prisma.hubReservation.findMany({
    where: { ...active(scope, newDate()), agentId: scope.actor.agent.id },
    orderBy: [{ expiresAt: "asc" }],
    take: 50,
  });
  return viewRows(scope, rows, scope.actor.agent.id);
}
