import { PromoScreen } from "@/components/admin/PromoScreen";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("adminPromo");

export const dynamic = "force-dynamic";

export default function AdminPromoPage() {
  return <PromoScreen />;
}
