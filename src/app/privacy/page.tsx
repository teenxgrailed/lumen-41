import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/LegalDocument";

import { privacyMarkdown } from "@/lib/legal/documents/privacy";

export const metadata: Metadata = {
  title: "Privacy Notice | Needt",
  description:
    "What personal data Needt collects, why, who handles it, how long it is kept, and your rights.",
};

export default function PrivacyPage() {
  return <LegalDocument markdown={privacyMarkdown()} />;
}
