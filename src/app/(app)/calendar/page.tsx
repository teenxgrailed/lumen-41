import { CalendarCraft } from "@/components/needt3/calendar/CalendarCraft";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("calendar");

export const dynamic = "force-dynamic";

export default function CalendarPage() {
  return <CalendarCraft />;
}
