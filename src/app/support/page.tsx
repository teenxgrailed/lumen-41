import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/LegalDocument";

import { supportMarkdown } from "@/lib/legal/documents/support";

export const metadata: Metadata = {
  title: "Support | Needt",
  description:
    "How to reach Needt support, and answers on signing in, deleting your account, exporting your data and cancelling an App Store subscription.",
};

export default function SupportPage() {
  return <LegalDocument markdown={supportMarkdown()} />;
}
