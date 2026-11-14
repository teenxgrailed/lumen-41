import { Suspense } from "react";

import type { Metadata } from "next";

import { RoadmapScreen } from "@/components/needt3/roadmap/RoadmapScreen";

import { projectTabTitle } from "@/lib/needt3/item-titles";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Roadmap · ${await projectTabTitle(id)}` };
}

/** One project's tasks as a metro map: done, now, next and blocked. */
export default async function ProjectRoadmapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <RoadmapScreen projectId={id} />
    </Suspense>
  );
}
