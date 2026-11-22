import { LearnLesson } from "@/components/needt3/learn/LearnLesson";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("learn");

export const dynamic = "force-dynamic";

/** One Learn lesson. */
export default async function LearnRoute({
  params,
}: {
  params: Promise<{ topicId: string; lessonId: string }>;
}) {
  const { topicId, lessonId } = await params;
  return <LearnLesson topicId={topicId} lessonId={lessonId} />;
}
