import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/LegalDocument";

import { isFeatureEnabledForEveryone } from "@/lib/feature-flags";
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

// Section 5.7 (App Store purchases) is shown while `apple_iap` is on for
// everyone, so it goes live with the flag rather than with this deploy.
async function appleIapOn(): Promise<boolean> {
  try {
    return await isFeatureEnabledForEveryone(APPLE_IAP);
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
