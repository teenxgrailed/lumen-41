import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/LegalDocument";

import { termsMarkdown } from "@/lib/legal/documents/terms";

export const metadata: Metadata = {
  title: "Terms of Service | Needt",
  description:
    "The agreement between you and the operator of Needt: plans, payment, refunds, your content and acceptable use.",
};

export default function TermsPage() {
  return <LegalDocument markdown={termsMarkdown()} />;
}
