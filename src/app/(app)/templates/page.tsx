import { TemplatesFace } from "@/components/needt3/phone/places";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("templates");

export const dynamic = "force-dynamic";

export default function TemplatesRoute() {
  return <TemplatesFace />;
}
