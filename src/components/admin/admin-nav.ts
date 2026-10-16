/**
 * The admin panel's places, in the order the left nav lists them. Each entry
 * is a real route under `src/app/(app)/admin/`. `exact` marks a place that
 * owns only its own path (the overview), so it is not "current" on every
 * child route.
 */
export interface AdminNavItem {
  href: string;
  label: string;
  exact?: boolean;
}

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: "/admin/system", label: "Integrations" },
  { href: "/admin/operations", label: "Operations" },
];

export function isNavCurrent(item: AdminNavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}
