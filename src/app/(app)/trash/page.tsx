import { TrashFace } from "@/components/needt3/phone/places";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("trash");

export const dynamic = "force-dynamic";

export default function TrashRoute() {
  return <TrashFace />;
}
