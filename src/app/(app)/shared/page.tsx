import { SharedFace } from "@/components/needt3/phone/places";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("shared");

export const dynamic = "force-dynamic";

export default function SharedRoute() {
  return <SharedFace />;
}
