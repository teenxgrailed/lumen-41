import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { NotFoundFace } from "@/components/needt3/states/NotFoundFace";

import { isDesignV3 } from "@/lib/needt3/design-flag";
import { missingRouteFace } from "@/lib/needt3/not-found";
import { SECTION_TITLES } from "@/lib/needt3/section-titles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: SECTION_TITLES.notFound,
  robots: { index: false, follow: false },
};

/**
 * Any address no route claims. With design_v3 on it is drawn inside the v3
 * shell (`NotFoundFace`); with the flag off, and for /api/* or a file-like
 * path, `notFound()` hands it to the root `not-found` exactly as before.
 * //todo: the v3 face answers 200; Next has no way to give a rendered page a
 * 404 status without the root not-found boundary.
 */
export default async function MissingRoute({
  params,
}: {
  params: Promise<{ missing: string[] }>;
}) {
  const { missing } = await params;
  if (missingRouteFace(missing, await isDesignV3()) !== "v3") notFound();
  return <NotFoundFace />;
}
