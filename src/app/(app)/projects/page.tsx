import { Suspense } from "react";

import { WorkScreen } from "@/components/needt3/work/WorkScreen";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("projects");

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <WorkScreen mode="projects" />
    </Suspense>
  );
}
