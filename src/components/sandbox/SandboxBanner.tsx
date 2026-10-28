"use client";

import { useLayoutEffect, useRef } from "react";

import { TOP_BANNER_VAR } from "@/components/auth/EmailVerificationGate";

/**
 * The one line a sandbox account always sees (docs/sandbox-accounts.md). It
 * sits where the email-confirmation banner sits and publishes its height the
 * same way, so the frame starts below it. A sandbox account is always
 * confirmed, so the two never show together.
 */
export function SandboxBanner() {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!el) return undefined;
    root.style.setProperty(
      TOP_BANNER_VAR,
      `${Math.ceil(el.getBoundingClientRect().height)}px`
    );
    return () => {
      root.style.removeProperty(TOP_BANNER_VAR);
    };
  }, []);

  return (
    <div
      ref={ref}
      role="note"
      data-top-banner=""
      data-sandbox-banner=""
      className="fixed inset-x-0 top-0 z-[100] flex min-h-7 items-center justify-center border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-1 text-center text-xs text-[var(--text-secondary)]"
    >
      Sandbox account — resets nightly
    </div>
  );
}
