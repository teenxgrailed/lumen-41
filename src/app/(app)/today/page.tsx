import { HomeScreen } from "@/components/needt3/home/HomeScreen";
import { TodayRoute } from "@/components/needt/home/TodayRoute";

import { isDesignV3 } from "@/lib/needt3/design-flag";

export const dynamic = "force-dynamic";

/** With design_v3 on, /today is the v3 Home; flag off, exactly as before. */
export default async function TodayPage() {
  if (await isDesignV3()) return <HomeScreen />;
  return <TodayRoute />;
}
