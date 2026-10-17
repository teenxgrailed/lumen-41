import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { NotFoundFace } from "@/components/needt3/states/NotFoundFace";

import { getAuthOptions } from "@/lib/auth/auth-options";
import { missingRouteFace } from "@/lib/needt3/not-found";
import { SECTION_TITLES } from "@/lib/needt3/section-titles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: SECTION_TITLES.notFound,
  robots: { index: false, follow: false },
};

/**
 * Any address no route claims. A signed-in person gets it drawn inside the
 * shell (`NotFoundFace`); a stranger, and any /api/* or file-like path, gets
 * `notFound()` and the root `not-found`.
 * //todo: the v3 face answers 200; Next has no way to give a rendered page a
 * 404 status without the root not-found boundary.
 */
export default async function MissingRoute({
  params,
}: {
  params: Promise<{ missing: string[] }>;
}) {
  const { missing } = await params;
  const session = await getServerSession(await getAuthOptions());
  if (missingRouteFace(missing, !!session?.user?.id) !== "v3") notFound();
  return <NotFoundFace />;
}
