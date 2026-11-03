"use client";

import { useStoreDistribution } from "@/lib/use-store-distribution";

/**
 * The "Needt" mark at the head of a legal page links to the website. A store
 * build (iOS app, Mac App Store) links nowhere off the app, so there the mark
 * is plain text. Terms, Privacy and Subprocessors stay links.
 */
export function LegalHomeLink() {
  const store = useStoreDistribution();
  if (store) return <span className="font-semibold">Needt</span>;
  return (
    <a href="https://needt.app" className="font-semibold">
      Needt
    </a>
  );
}
