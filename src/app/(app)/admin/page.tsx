import { OverviewScreen } from "@/components/admin/OverviewScreen";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("adminOverview");

export const dynamic = "force-dynamic";

export default function AdminOverviewPage() {
  return <OverviewScreen />;
}
