import { ConnectionsFace } from "@/components/needt3/phone/places";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("connections");

export const dynamic = "force-dynamic";

export default function ConnectionsRoute() {
  return <ConnectionsFace />;
}
