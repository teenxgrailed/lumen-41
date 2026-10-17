import { SettingsRedirect } from "@/components/needt3/settings/SettingsRedirect";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("settings");

export const dynamic = "force-dynamic";

/** Settings is a sheet over Today; /settings#section opens it. */
export default function SettingsPage() {
  return <SettingsRedirect />;
}
