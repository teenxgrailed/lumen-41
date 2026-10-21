import { V3DesktopCompleteRoute } from "@/components/needt3/auth/DesktopCompleteRoute";

import { requestPhoneUi } from "@/lib/needt3/request-phone-ui";
import { SECTION_TITLES } from "@/lib/needt3/section-titles";

export const dynamic = "force-dynamic";

export const metadata = {
  title: SECTION_TITLES.desktopApp,
  referrer: "no-referrer",
};

/** Opened only by the desktop app; the one-time code rides in the fragment. */
export default async function DesktopCompletePage() {
  return <V3DesktopCompleteRoute {...await requestPhoneUi()} />;
}
