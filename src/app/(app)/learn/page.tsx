import { LearnOverview } from "@/components/needt3/learn/LearnOverview";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("learn");

export const dynamic = "force-dynamic";

/** The Learn place: topics as folders. */
export default function LearnRoute() {
  return <LearnOverview />;
}
