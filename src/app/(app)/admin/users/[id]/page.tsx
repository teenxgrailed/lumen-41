import { UserDetailScreen } from "@/components/admin/UserDetailScreen";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("adminUsers");

export const dynamic = "force-dynamic";

export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <UserDetailScreen userId={id} />;
}
