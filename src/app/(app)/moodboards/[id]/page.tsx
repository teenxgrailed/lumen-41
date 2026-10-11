import { MoodboardWorkspace } from "@/components/moodboards/MoodboardWorkspace";
import { MoodboardRoute } from "@/components/needt3/phone/moodboards/MoodboardsRoute";

import { isDesignV3 } from "@/lib/needt3/design-flag";

export default async function MoodboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspace = <MoodboardWorkspace moodboardId={id} />;
  /* Flag on: the phone gets its own board page, every other width keeps the
     workspace. Flag off: exactly the workspace, as before. */
  if (await isDesignV3()) return <MoodboardRoute id={id} desktop={workspace} />;
  return workspace;
}
