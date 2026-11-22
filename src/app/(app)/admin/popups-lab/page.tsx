import { Suspense } from "react";

import type { Metadata } from "next";

import { PopupsLab } from "@/components/needt3/popups/PopupsLab";

export const metadata: Metadata = { title: "Popups lab" };

export const dynamic = "force-dynamic";

/**
 * The popups, every one of them, on fixed demo content. Admin only (the
 * layout's check). `?s=whatsnew|upsell|trial|rating|wish|friction|nps|thanks|review`
 * opens one at once; `?native=1` makes the review step the platform's own.
 * Nothing here talks to a server.
 */
export default function PopupsLabPage() {
  return (
    <Suspense fallback={null}>
      <PopupsLab />
    </Suspense>
  );
}
