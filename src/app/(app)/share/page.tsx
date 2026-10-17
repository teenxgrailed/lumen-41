import { SharePage } from "@/components/needt3/share/SharePage";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("share");

export const dynamic = "force-dynamic";

/** Where the OS share sheet lands (manifest `share_target`). Signed-out visitors are sent to sign in first, with this URL as the way back. */
export default function Page() {
  return <SharePage />;
}
