import { notFound } from "next/navigation";

import { SharedFace } from "@/components/needt3/phone/places";

import { isDesignV3 } from "@/lib/needt3/design-flag";

export const dynamic = "force-dynamic";

/** Shared is a design v3 place; with the flag off the route does not exist. */
export default async function SharedRoute() {
  if (!(await isDesignV3())) notFound();
  return <SharedFace />;
}
