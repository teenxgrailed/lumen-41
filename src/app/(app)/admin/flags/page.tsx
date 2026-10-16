import { FlagsScreen } from "@/components/admin/FlagsScreen";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("adminFlags");

export const dynamic = "force-dynamic";

export default function AdminFlagsPage() {
  return <FlagsScreen />;
}
