import { AdminPage } from "@/components/admin/kit";
import { LogViewer } from "@/components/settings/LogViewer";
import { SystemSettings } from "@/components/settings/SystemSettings";
import { UserManagement } from "@/components/settings/UserManagement";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("system");

export const dynamic = "force-dynamic";

/** Integrations: provider secrets, sign-in providers, sign-ups, logs. The admin check is the layout's. */
export default function AdminSystemPage() {
  return (
    <AdminPage
      title="Integrations"
      lead="Provider credentials and system-wide settings."
    >
      <div className="admin-stack" data-testid="admin-system-form">
        <SystemSettings />
        <UserManagement />
        <LogViewer />
      </div>
    </AdminPage>
  );
}
