import { HabitsRoute as HabitsRouteBody } from "@/components/needt3/phone/habits/HabitsRoute";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("habits");

export const dynamic = "force-dynamic";

export default function HabitsRoute() {
  return <HabitsRouteBody />;
}
