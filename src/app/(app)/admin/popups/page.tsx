import { PopupsScreen } from "@/components/admin/PopupsScreen";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("adminPopups");

export const dynamic = "force-dynamic";

/** Popups: announcements as data, with publish and stats. The admin check is the layout's. */
export default function AdminPopupsPage() {
  return <PopupsScreen />;
}
