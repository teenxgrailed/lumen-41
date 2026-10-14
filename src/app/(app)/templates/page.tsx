import { notFound } from "next/navigation";

import { TemplatesFace } from "@/components/needt3/phone/places";

import { isDesignV3 } from "@/lib/needt3/design-flag";
import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("templates");

export const dynamic = "force-dynamic";

/** Templates is a design v3 place; with the flag off the route does not exist. */
export default async function TemplatesRoute() {
  if (!(await isDesignV3())) notFound();
  return <TemplatesFace />;
}
