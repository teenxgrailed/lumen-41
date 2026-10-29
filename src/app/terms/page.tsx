import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/LegalDocument";

import { termsMarkdown } from "@/lib/legal/documents/terms";

export const metadata: Metadata = {
  title: "Terms of Service | Needt",
  description:
    "The agreement between you and the operator of Needt: plans, payment, refunds, your content and acceptable use.",
};

// DMCA_AGENT_REG_NO is read when the page is served, not when it is built, so
// setting it in the environment takes effect on the next restart.
export const dynamic = "force-dynamic";

export default function TermsPage() {
  return <LegalDocument markdown={termsMarkdown()} />;
}
