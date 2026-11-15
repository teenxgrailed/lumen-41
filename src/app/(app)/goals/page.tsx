import { Suspense } from "react";

import { GoalsScreen } from "@/components/needt3/goals/GoalsScreen";
import { NeedtLoading } from "@/components/needt3/states/NeedtLoading";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("goals");

export const dynamic = "force-dynamic";

export default function GoalsPage() {
  return (
    <Suspense fallback={<NeedtLoading />}>
      <GoalsScreen />
    </Suspense>
  );
}
