import { Suspense } from "react";

import { WorkScreen } from "@/components/needt3/work/WorkScreen";
import { WorkspaceRoute } from "@/components/needt/workspace";

import { isDesignV3 } from "@/lib/needt3/design-flag";

export default async function TasksPage() {
  if (await isDesignV3()) {
    return (
      <Suspense fallback={null}>
        <WorkScreen mode="tasks" />
      </Suspense>
    );
  }
  return (
    <div className="absolute inset-0 max-lg:bottom-[calc(68px+env(safe-area-inset-bottom))] max-lg:top-14">
      <WorkspaceRoute />
    </div>
  );
}
