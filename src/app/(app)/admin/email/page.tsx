import { EmailScreen } from "@/components/admin/EmailScreen";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("adminEmail");

export const dynamic = "force-dynamic";

/** Email: templates, broadcasts and the send ledger. The admin check is the layout's. */
export default function AdminEmailPage() {
  return <EmailScreen />;
}
