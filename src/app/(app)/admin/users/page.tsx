import { UsersScreen } from "@/components/admin/UsersScreen";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("adminUsers");

export const dynamic = "force-dynamic";

export default function AdminUsersPage() {
  return <UsersScreen />;
}
