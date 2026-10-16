import {
  BILLING_CHECKOUT,
  DESIGN_V3,
  SIGNUPS_OPEN,
} from "@/lib/feature-flags-keys";
import { prisma } from "@/lib/prisma";

/**
 * Flags the code reads that may have no row yet. They are listed (off) so
 * they can be turned on from the panel, and a first toggle creates the row.
 */
export const KNOWN_FLAG_KEYS: readonly string[] = [
  BILLING_CHECKOUT,
  SIGNUPS_OPEN,
  DESIGN_V3,
];

export interface AdminFlag {
  key: string;
  enabled: boolean;
  rolloutPercentage: number;
  description: string | null;
  /** False for a known flag that has no row yet (it reads as off). */
  exists: boolean;
  updatedAt: string | null;
}

export async function listAdminFlags(): Promise<AdminFlag[]> {
  const rows = await prisma.featureFlag.findMany({
    orderBy: { key: "asc" },
    select: {
      key: true,
      enabled: true,
      rolloutPercentage: true,
      description: true,
      updatedAt: true,
    },
  });
  const flags: AdminFlag[] = rows.map((row) => ({
    key: row.key,
    enabled: row.enabled,
    rolloutPercentage: row.rolloutPercentage,
    description: row.description,
    exists: true,
    updatedAt: row.updatedAt.toISOString(),
  }));
  const have = new Set(flags.map((flag) => flag.key));
  for (const key of KNOWN_FLAG_KEYS) {
    if (have.has(key)) continue;
    flags.push({
      key,
      enabled: false,
      rolloutPercentage: 0,
      description: null,
      exists: false,
      updatedAt: null,
    });
  }
  return flags.sort((a, b) => a.key.localeCompare(b.key));
}

export function clampRollout(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
