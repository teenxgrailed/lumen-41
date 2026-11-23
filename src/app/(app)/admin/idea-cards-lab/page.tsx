import { Suspense } from "react";

import type { Metadata } from "next";

import { IdeaCardLab } from "@/components/needt3/idea-cards/IdeaCardLab";

export const metadata: Metadata = { title: "Idea cards lab" };

export const dynamic = "force-dynamic";

/**
 * Idea cards, three skins, between real task rows. Admin only (the layout's
 * check). Design exploration: nothing here is wired to data or shipped.
 */
export default function IdeaCardsLabPage() {
  return (
    <Suspense fallback={null}>
      <IdeaCardLab />
    </Suspense>
  );
}
