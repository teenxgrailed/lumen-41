import { HomeScreen } from "@/components/needt3/home/HomeScreen";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("today");

export const dynamic = "force-dynamic";

export default function TodayPage() {
  return <HomeScreen />;
}
