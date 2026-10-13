import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/LegalDocument";

import { subprocessorsMarkdown } from "@/lib/legal/documents/subprocessors";

export const metadata: Metadata = {
  title: "Subprocessors | Needt",
  description: "The third parties that process personal data for Needt.",
};

export default function SubprocessorsPage() {
  return <LegalDocument markdown={subprocessorsMarkdown()} />;
}
