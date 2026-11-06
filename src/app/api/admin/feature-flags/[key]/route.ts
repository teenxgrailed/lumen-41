import { NextRequest, NextResponse } from "next/server";

import { adminActorId } from "@/services/admin/audit";

import { requireAdmin } from "@/lib/auth/api-auth";
import {
  KNOWN_FEATURE_FLAGS,
  isKnownFeatureFlag,
} from "@/lib/feature-flags-keys";
import { prisma } from "@/lib/prisma";

const HISTORY_LIMIT = 20;

type RouteContext = { params: Promise<{ key: string }> };

/** A known flag that has no row yet reads as what the code assumes: off. */
function defaultFlag(key: string) {
  return {
    key,
    enabled: false,
    rolloutPercentage: 0,
    description: KNOWN_FEATURE_FLAGS[key] ?? null,
    overrides: [],
    persisted: false,
  };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { key } = await params;
  const [flag, history] = await Promise.all([
    prisma.featureFlag.findUnique({
      where: { key },
      include: {
        overrides: {
          include: { user: { select: { email: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.featureFlagChange.findMany({
      where: { flagKey: key },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
    }),
  ]);
  const changes = await withActorEmails(history ?? []);
  if (flag) {
    return NextResponse.json({
      flag: {
        ...flag,
        overrides: flag.overrides.map(({ user, ...override }) => ({
          ...override,
          email: user?.email ?? null,
        })),
        persisted: true,
      },
      history: changes,
    });
  }
  if (isKnownFeatureFlag(key)) {
    return NextResponse.json({ flag: defaultFlag(key), history: changes });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** The change rows with the actor's email, looked up in one query. */
async function withActorEmails(
  rows: {
    id: string;
    flagKey: string;
    actorUserId: string | null;
    before: unknown;
    after: unknown;
    createdAt: Date;
  }[]
) {
  const ids = [
    ...new Set(rows.map((r) => r.actorUserId).filter((id) => id !== null)),
  ] as string[];
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, email: true },
      })
    : [];
  const emailOf = new Map(users.map((u) => [u.id, u.email]));
  return rows.map((row) => ({
    id: row.id,
    actorEmail: row.actorUserId ? (emailOf.get(row.actorUserId) ?? null) : null,
    before: row.before,
    after: row.after,
    createdAt: row.createdAt.toISOString(),
  }));
}

type Body = {
  enabled?: unknown;
  rolloutPercentage?: unknown;
  userId?: unknown;
  email?: unknown;
  self?: unknown;
  userEnabled?: unknown;
  remove?: unknown;
};

/**
 * Changes a flag or one person's override, and writes the change to
 * `FeatureFlagChange` in the same transaction.
 *
 * - `{ enabled?, rolloutPercentage? }` edits the flag.
 * - `{ userId | email | self, userEnabled }` sets an override; `email` is
 *   looked up here (never ask for a raw id), `self` is the calling admin.
 * - `{ userId | email | self, remove: true }` removes an override.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { key } = await params;
  const body = ((await request.json().catch(() => null)) ?? {}) as Body;
  const known = isKnownFeatureFlag(key);
  if (!known) {
    const exists = await prisma.featureFlag.findUnique({
      where: { key },
      select: { key: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }
  const actorUserId = await adminActorId(request);
  const aimsAtUser =
    typeof body.userId === "string" ||
    typeof body.email === "string" ||
    body.self === true;
  if (aimsAtUser) {
    const wantsRemove = body.remove === true;
    if (!wantsRemove && typeof body.userEnabled !== "boolean") {
      return NextResponse.json(
        { error: "Say whether the override is on or off." },
        { status: 400 }
      );
    }
    const target = await resolveTarget(body, actorUserId);
    if (!target) {
      return NextResponse.json(
        { error: missingTargetMessage(body) },
        { status: 404 }
      );
    }
    const userEnabled = body.userEnabled === true;
    const override = await prisma.$transaction(async (tx) => {
      /* A known flag gets its row on the first write (off, 0%), so an
         override can be set before anybody seeded the flag. */
      if (known) {
        await tx.featureFlag.upsert({
          where: { key },
          update: {},
          create: { key, description: KNOWN_FEATURE_FLAGS[key] },
        });
      }
      const where = { flagKey_userId: { flagKey: key, userId: target.id } };
      const previous = await tx.featureFlagOverride.findUnique({ where });
      let saved = null;
      if (wantsRemove) {
        if (previous) await tx.featureFlagOverride.delete({ where });
      } else {
        saved = await tx.featureFlagOverride.upsert({
          where,
          update: { enabled: userEnabled },
          create: { flagKey: key, userId: target.id, enabled: userEnabled },
        });
      }
      /* Removing nothing, or setting what is already set, is not a change. */
      const unchanged = wantsRemove
        ? !previous
        : previous?.enabled === userEnabled;
      if (!unchanged) {
        await tx.featureFlagChange.create({
          data: {
            flagKey: key,
            actorUserId,
            before: previous
              ? { override: { email: target.email, enabled: previous.enabled } }
              : { override: null },
            after: wantsRemove
              ? { override: null, email: target.email }
              : { override: { email: target.email, enabled: userEnabled } },
          },
        });
      }
      return saved;
    });
    return NextResponse.json({ override });
  }
  const hasRollout = body.rolloutPercentage !== undefined;
  const rolloutValid =
    typeof body.rolloutPercentage === "number" &&
    Number.isInteger(body.rolloutPercentage) &&
    body.rolloutPercentage >= 0 &&
    body.rolloutPercentage <= 100;
  const enabled = typeof body.enabled === "boolean" ? body.enabled : undefined;
  if (
    (hasRollout && !rolloutValid) ||
    (enabled === undefined && !rolloutValid)
  ) {
    return NextResponse.json(
      {
        error:
          "Send enabled as true or false, or a rollout percentage as a whole number from 0 to 100.",
      },
      { status: 400 }
    );
  }
  const rolloutPercentage = rolloutValid
    ? (body.rolloutPercentage as number)
    : undefined;
  const flag = await prisma.$transaction(async (tx) => {
    const previous = await tx.featureFlag.findUnique({
      where: { key },
      select: { enabled: true, rolloutPercentage: true },
    });
    const saved = await tx.featureFlag.upsert({
      where: { key },
      update: { enabled, rolloutPercentage },
      create: {
        key,
        description: KNOWN_FEATURE_FLAGS[key] ?? null,
        enabled: enabled ?? false,
        rolloutPercentage: rolloutPercentage ?? 0,
      },
    });
    const before = previous ?? { enabled: false, rolloutPercentage: 0 };
    const after = {
      enabled: saved.enabled,
      rolloutPercentage: saved.rolloutPercentage,
    };
    /* A save that changes nothing leaves no history row. */
    if (
      before.enabled !== after.enabled ||
      before.rolloutPercentage !== after.rolloutPercentage
    ) {
      await tx.featureFlagChange.create({
        data: { flagKey: key, actorUserId, before, after },
      });
    }
    return saved;
  });
  return NextResponse.json({ flag });
}

/** Which selector the caller used decides what "not found" says. */
function missingTargetMessage(body: Body): string {
  if (body.self === true) return "Your own account was not found.";
  if (typeof body.email === "string") return "No account found for that email.";
  return "No account found for that user id.";
}

/** The account an override is about: the caller, an email, or a raw id. */
async function resolveTarget(body: Body, actorUserId: string | null) {
  if (body.self === true) {
    if (!actorUserId) return null;
    return prisma.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, email: true },
    });
  }
  if (typeof body.email === "string") {
    const email = body.email.trim();
    if (!email) return null;
    return prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true },
    });
  }
  if (typeof body.userId === "string") {
    return prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, email: true },
    });
  }
  return null;
}
