import { Suspense } from "react";

import { NeedtLoading } from "@/components/needt3/states/NeedtLoading";
import { WorkScreen } from "@/components/needt3/work/WorkScreen";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("tasks");

export default function TasksPage() {
  return (
    <Suspense fallback={<NeedtLoading />}>
      <WorkScreen mode="tasks" />
    </Suspense>
  );
}
