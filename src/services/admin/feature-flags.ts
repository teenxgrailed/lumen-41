import { KNOWN_FEATURE_FLAGS } from "@/lib/feature-flags-keys";
import { prisma } from "@/lib/prisma";

export interface AdminFeatureFlagRow {
  key: string;
  enabled: boolean;
  rolloutPercentage: number;
  description: string | null;
  overrides: number;
  known: boolean;
  persisted: boolean;
}

/**
 * Every flag the code reads plus any other row in the table, each with its
 * state. A known flag with no row is listed as off (`persisted: false`); the
 * `[key]` route creates the row on the first write. The admin flags list and
 * the read-only MCP admin tools both read this.
 */
export async function listAdminFeatureFlags(): Promise<AdminFeatureFlagRow[]> {
  const rows = await prisma.featureFlag.findMany({
    include: { _count: { select: { overrides: true } } },
    orderBy: { key: "asc" },
  });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const keys = [
    ...new Set([...Object.keys(KNOWN_FEATURE_FLAGS), ...byKey.keys()]),
  ].sort();
  return keys.map((key) => {
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
}
