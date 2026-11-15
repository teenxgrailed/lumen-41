import { Suspense } from "react";

import { getServerSession } from "next-auth";

import { GoalsScreen } from "@/components/needt3/goals/GoalsScreen";

import { getAuthOptions } from "@/lib/auth/auth-options";
import { habitsCardsEnabled } from "@/lib/feature-flags";
import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("goals");

export const dynamic = "force-dynamic";

/** Goal cards are behind `habits_cards_v1` (fails closed). */
export default async function GoalsPage() {
  const session = await getServerSession(await getAuthOptions());
  const cards = await habitsCardsEnabled(session?.user?.id);
  return (
    <Suspense fallback={null}>
      <GoalsScreen cards={cards} />
    </Suspense>
  );
}
