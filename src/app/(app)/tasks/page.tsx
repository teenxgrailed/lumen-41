import { Suspense } from "react";

import { WorkScreen } from "@/components/needt3/work/WorkScreen";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("tasks");

export default function TasksPage() {
  return (
    <Suspense fallback={null}>
      <WorkScreen mode="tasks" />
    </Suspense>
  );
}
