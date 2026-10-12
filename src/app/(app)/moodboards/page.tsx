import { MoodboardsHome } from "@/components/moodboards/MoodboardsHome";
import { MoodboardsRoute } from "@/components/needt3/phone/moodboards/MoodboardsRoute";

import { isDesignV3 } from "@/lib/needt3/design-flag";

export const dynamic = "force-dynamic";

export default async function MoodboardsPage() {
  if (await isDesignV3()) return <MoodboardsRoute />;
  return <MoodboardsHome />;
}
