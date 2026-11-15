import { Suspense } from "react";

import { getServerSession } from "next-auth";

import { WorkScreen } from "@/components/needt3/work/WorkScreen";

import { getAuthOptions } from "@/lib/auth/auth-options";
import { foldersV1Enabled } from "@/lib/feature-flags";
import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("projects");

export const dynamic = "force-dynamic";

/** Projects as folders only for accounts the `folders_v1` flag is on for. */
export default async function ProjectsPage() {
  let folders = false;
  try {
    const session = await getServerSession(await getAuthOptions());
    folders = await foldersV1Enabled(session?.user?.id);
  } catch {
    folders = false;
  }
  return (
    <Suspense fallback={null}>
      <WorkScreen mode="projects" folders={folders} />
    </Suspense>
  );
}
