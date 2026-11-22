import type { PopupPlan, PopupPlatform } from "./types";

/** Who an announcement is for. An empty list or a null bound means no restriction. */
export interface Audience {
  plans: readonly string[];
  platforms: readonly string[];
  minAppVersion: string | null;
  signedUpBefore: Date | null;
  signedUpAfter: Date | null;
  minActiveDays: number | null;
}

/** What is known about the person and the client asking. */
export interface AudienceFacts {
  plan: PopupPlan;
  platform: PopupPlatform;
  appVersion: string | null;
  signedUpAt: Date;
  /** Days between signing up and the last time the app was used. */
  activeDays: number;
}

/** Numeric dotted-version compare: 1.10.0 > 1.9.2. Missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const pb = b.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export function matchesAudience(
  audience: Audience,
  facts: AudienceFacts
): boolean {
  if (audience.plans.length > 0 && !audience.plans.includes(facts.plan)) {
    return false;
  }
  if (
    audience.platforms.length > 0 &&
    !audience.platforms.includes(facts.platform)
  ) {
    return false;
  }
  if (audience.minAppVersion) {
    // A client that does not report its version cannot be shown a gated popup.
    if (!facts.appVersion) return false;
    if (compareVersions(facts.appVersion, audience.minAppVersion) < 0) {
      return false;
    }
  }
  if (
    audience.signedUpBefore &&
    facts.signedUpAt.getTime() >= audience.signedUpBefore.getTime()
  ) {
    return false;
  }
  if (
    audience.signedUpAfter &&
    facts.signedUpAt.getTime() < audience.signedUpAfter.getTime()
  ) {
    return false;
  }
  if (
    audience.minActiveDays !== null &&
    facts.activeDays < audience.minActiveDays
  ) {
    return false;
  }
  return true;
}
