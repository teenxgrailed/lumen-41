import { notFound } from "next/navigation";

import { HabitsRoute as HabitsRouteBody } from "@/components/needt3/phone/habits/HabitsRoute";

import { isDesignV3 } from "@/lib/needt3/design-flag";

export const dynamic = "force-dynamic";

/**
 * Habits is a design v3 place; with the flag off the route does not exist.
 * The route body picks the phone face or the desktop screen (HabitsScreen).
 */
export default async function HabitsRoute() {
  if (!(await isDesignV3())) notFound();
  return <HabitsRouteBody />;
}
