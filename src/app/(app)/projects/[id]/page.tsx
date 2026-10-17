import { Suspense } from "react";

import type { Metadata } from "next";

import { WorkScreen } from "@/components/needt3/work/WorkScreen";

import { projectTabTitle } from "@/lib/needt3/item-titles";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: await projectTabTitle(id) };
}

/** One project's page. */
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <WorkScreen mode="projects" projectId={id} />
    </Suspense>
  );
}
