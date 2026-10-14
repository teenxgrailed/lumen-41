import { Suspense } from "react";

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkScreen } from "@/components/needt3/work/WorkScreen";

import { isDesignV3 } from "@/lib/needt3/design-flag";
import { projectTabTitle } from "@/lib/needt3/item-titles";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: await projectTabTitle(id) };
}

/** One project's page; it exists only in the v3 design. */
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isDesignV3())) notFound();
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <WorkScreen mode="projects" projectId={id} />
    </Suspense>
  );
}
