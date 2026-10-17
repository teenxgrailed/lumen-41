import { AdminShell } from "@/components/admin/AdminShell";
import AccessDeniedMessage from "@/components/auth/AccessDeniedMessage";

import { isAdmin } from "@/lib/auth/is-admin";

export const dynamic = "force-dynamic";

/**
 * Every /admin page. The admin check runs here once, on the server, so a
 * page below never renders for anyone else; the APIs behind the pages check
 * again with `requireAdmin`.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAdmin())) {
    return (
      <div className="admin-shell" data-testid="admin-access-denied">
        <div className="admin-main">
          <AccessDeniedMessage message="You do not have permission to open the admin panel." />
        </div>
      </div>
    );
  }
  return <AdminShell>{children}</AdminShell>;
}
