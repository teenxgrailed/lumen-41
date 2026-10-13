import { DocsFace } from "@/components/needt3/phone/docs";
import { DocsRoute } from "@/components/needt/docs";

import { isDesignV3 } from "@/lib/needt3/design-flag";
import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("docs");

export default async function PagesPage() {
  if (await isDesignV3()) return <DocsFace />;
  return <DocsRoute />;
}
