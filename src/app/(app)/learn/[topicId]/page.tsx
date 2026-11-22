import { LearnTopic } from "@/components/needt3/learn/LearnTopic";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("learn");

export const dynamic = "force-dynamic";

/** One Learn topic: its lessons as a card stack. */
export default async function LearnRoute({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  return <LearnTopic topicId={topicId} />;
}
