"use client";

import type { ReactNode } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ADMIN_NAV, isNavCurrent } from "./admin-nav";

/**
 * The one frame every /admin page renders in: a left nav (a scrolling row of
 * tabs on a phone) and the page. It sits inside the v3 scope, so the colours
 * come from the person's theme, Light, Dark or Time.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  return (
    <div className="admin-shell" data-testid="admin-shell">
      <nav className="admin-nav" aria-label="Admin sections">
        <span className="admin-nav-eyebrow">Admin</span>
        <ul className="admin-nav-list">
          {ADMIN_NAV.map((item) => {
            const current = isNavCurrent(item, pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={"admin-nav-item" + (current ? " is-current" : "")}
                  aria-current={current ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="admin-main">{children}</div>
    </div>
  );
}
