import { FlagsScreen } from "@/components/admin/FlagsScreen";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("adminFlags");

export const dynamic = "force-dynamic";

/** Feature flags: state, rollout, per-person overrides and history. The admin check is the layout's. */
export default function AdminFlagsPage() {
  return <FlagsScreen />;
}
