import type { Metadata } from "next";

import { MoodboardWorkspace } from "@/components/moodboards/MoodboardWorkspace";
import { MoodboardRoute } from "@/components/needt3/phone/moodboards/MoodboardsRoute";

import { isDesignV3 } from "@/lib/needt3/design-flag";
import { moodboardTabTitle } from "@/lib/needt3/item-titles";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: await moodboardTabTitle(id) };
}

export default async function MoodboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  /* Flag off: exactly the collaborative canvas, as before. Flag on: the grid
     (docs/port/01-data-map.md §7: the grid is the truth); what the canvas
     stored shows on it read-only. `?view=canvas` still opens the canvas for
     the shapes and strokes that have no grid form. */
  if ((await isDesignV3()) && view !== "canvas")
    return <MoodboardRoute id={id} />;
  return <MoodboardWorkspace moodboardId={id} />;
}
