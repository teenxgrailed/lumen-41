import { FeedbackScreen } from "@/components/admin/FeedbackScreen";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("adminFeedback");

export const dynamic = "force-dynamic";

/** In-app feedback answers and their averages. The admin check is the layout's. */
export default function AdminFeedbackPage() {
  return <FeedbackScreen />;
}
