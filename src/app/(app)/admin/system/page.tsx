import Link from "next/link";

import AccessDeniedMessage from "@/components/auth/AccessDeniedMessage";
import { LogViewer } from "@/components/settings/LogViewer";
import { SystemSettings } from "@/components/settings/SystemSettings";
import { UserManagement } from "@/components/settings/UserManagement";

import { isAdmin } from "@/lib/auth/is-admin";
import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("system");

export const dynamic = "force-dynamic";

export default async function AdminSystemPage() {
  const hasAdminAccess = await isAdmin();

  return (
    <main className="needt-page-depth min-h-dvh px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Admin
            </p>
            <h1 className="mt-1 text-2xl font-semibold">System settings</h1>
          </div>
          <nav
            aria-label="Admin sections"
            className="flex items-center gap-1 text-sm"
          >
            <Link
              href="/admin/operations"
              className="rounded-md px-3 py-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            >
              Operations
            </Link>
            <Link
              href="/admin/system"
              aria-current="page"
              className="rounded-md bg-[var(--surface-hover)] px-3 py-2 text-[var(--text-primary)]"
            >
              System settings
            </Link>
          </nav>
        </header>

        {hasAdminAccess ? (
          <div className="space-y-10" data-testid="admin-system-form">
            <SystemSettings />
            <UserManagement />
            <LogViewer />
          </div>
        ) : (
          <div data-testid="admin-system-access-denied">
            <AccessDeniedMessage message="You do not have permission to access system settings." />
          </div>
        )}
      </div>
    </main>
  );
}
