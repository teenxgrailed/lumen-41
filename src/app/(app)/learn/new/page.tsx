import { LearnNewTopic } from "@/components/needt3/learn/LearnNewTopic";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("learn");

export const dynamic = "force-dynamic";

/** A new Learn topic. */
export default function LearnRoute() {
  return <LearnNewTopic />;
}
