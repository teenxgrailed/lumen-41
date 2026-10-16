import { MoodboardsRoute } from "@/components/needt3/phone/moodboards/MoodboardsRoute";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("moodboards");

export const dynamic = "force-dynamic";

export default function MoodboardsPage() {
  return <MoodboardsRoute />;
}
