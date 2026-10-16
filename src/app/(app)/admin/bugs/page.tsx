import { BugsScreen } from "@/components/admin/BugsScreen";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("adminBugs");

export const dynamic = "force-dynamic";

export default function AdminBugsPage() {
  return <BugsScreen />;
}
