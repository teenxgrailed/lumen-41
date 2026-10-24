import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/api-auth";
import { KNOWN_FEATURE_FLAGS } from "@/lib/feature-flags-keys";
import { prisma } from "@/lib/prisma";

/**
 * Every flag the code reads plus any other row in the table, each with its
 * state. A known flag with no row is listed as off (`persisted: false`); the
 * `[key]` route creates the row on the first write.
 */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const rows = await prisma.featureFlag.findMany({
    include: { _count: { select: { overrides: true } } },
    orderBy: { key: "asc" },
  });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const keys = [
    ...new Set([...Object.keys(KNOWN_FEATURE_FLAGS), ...byKey.keys()]),
  ].sort();
  const flags = keys.map((key) => {
    const row = byKey.get(key);
    return {
      key,
      enabled: row?.enabled ?? false,
      rolloutPercentage: row?.rolloutPercentage ?? 0,
      description: row?.description ?? KNOWN_FEATURE_FLAGS[key] ?? null,
      overrides: row?._count.overrides ?? 0,
      known: key in KNOWN_FEATURE_FLAGS,
      persisted: Boolean(row),
    };
  });
  return NextResponse.json({ flags });
}
