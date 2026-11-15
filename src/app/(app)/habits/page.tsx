import { getServerSession } from "next-auth";

import { HabitsRoute as HabitsRouteBody } from "@/components/needt3/phone/habits/HabitsRoute";

import { getAuthOptions } from "@/lib/auth/auth-options";
import { habitsCardsEnabled } from "@/lib/feature-flags";
import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("habits");

export const dynamic = "force-dynamic";

/** The card stack and month grid are behind `habits_cards_v1` (fails closed). */
export default async function HabitsRoute() {
  const session = await getServerSession(await getAuthOptions());
  const cards = await habitsCardsEnabled(session?.user?.id);
  return <HabitsRouteBody cards={cards} />;
}
