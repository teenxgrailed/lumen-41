import { CalendarCraft } from "@/components/needt3/calendar/CalendarCraft";
import { CalendarRoute } from "@/components/needt/calendar/CalendarRoute";

import { isDesignV3 } from "@/lib/needt3/design-flag";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  if (await isDesignV3()) return <CalendarCraft />;
  return (
    <div className="absolute inset-0 max-lg:bottom-[calc(68px+env(safe-area-inset-bottom))] max-lg:top-14">
      <CalendarRoute />
    </div>
  );
}
