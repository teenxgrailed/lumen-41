import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";

import { LegalDocument } from "@/components/legal/LegalDocument";

import { isAppleIapConfigured } from "@/lib/apple-iap/config";
import { getAuthOptions } from "@/lib/auth/auth-options";
import {
  isFeatureEnabled,
  isFeatureEnabledForEveryone,
} from "@/lib/feature-flags";
import { APPLE_IAP } from "@/lib/feature-flags-keys";
import { termsMarkdown } from "@/lib/legal/documents/terms";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "TermsPage";

export const metadata: Metadata = {
  title: "Terms of Service | Needt",
  description:
    "The agreement between you and the operator of Needt: plans, payment, refunds, your content and acceptable use.",
};

// DMCA_AGENT_REG_NO is read when the page is served, not when it is built, so
// setting it in the environment takes effect on the next restart.
export const dynamic = "force-dynamic";

// Section 5.7 (App Store purchases) is shown when the App Store sells to this
// reader: the same test as the purchase sheet (`appleAccountToken`), so the
// reviewer account with a per-account override reads 5.7 next to a working
// sheet. A signed-out reader gets the flag for everyone. It goes live with the
// flag and the APPLE_IAP_* env rather than with this deploy.
async function appleIapOn(): Promise<boolean> {
  if (!isAppleIapConfigured()) return false;
  try {
    const session = await getServerSession(await getAuthOptions());
    const userId = session?.user?.id;
    return userId
      ? await isFeatureEnabled(APPLE_IAP, userId)
      : await isFeatureEnabledForEveryone(APPLE_IAP);
  } catch (error) {
    await logger.error(
      "Could not read the apple_iap flag for the terms",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return false;
  }
}

export default async function TermsPage() {
  return (
    <LegalDocument markdown={termsMarkdown()} appleIap={await appleIapOn()} />
  );
}
