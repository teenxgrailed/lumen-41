"use client";

import { useEffect } from "react";

import Link from "next/link";

import { getAppVersion, getVersionHref } from "@/lib/version";

export default function NotFound() {
  useEffect(() => {
    document.title = "404 - Page Not Found";
  }, []);

  return (
    <div className="needt-page-depth flex min-h-dvh flex-col items-center justify-center p-4 text-center text-[var(--text-primary)]">
      <h1 className="mb-4 text-4xl font-bold">404 - Page Not Found</h1>
      <p className="mb-6">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="rounded-[var(--control-radius)] border border-[var(--button-primary-border)] bg-[var(--button-primary-bg)] px-4 py-2 text-[var(--button-primary-fg)] transition-colors hover:bg-[var(--button-primary-bg-hover)]"
      >
        Return Home
      </Link>
      <a
        href={getVersionHref()}
        target="_blank"
        rel="noopener noreferrer"
        title="What changed in this version"
        className="mt-8 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] hover:underline"
      >
        v{getAppVersion()}
      </a>
    </div>
  );
}
