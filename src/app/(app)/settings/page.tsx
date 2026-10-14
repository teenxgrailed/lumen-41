import { SettingsRedirect } from "@/components/needt3/settings/SettingsRedirect";
import { SettingsRoute } from "@/components/needt/settings";

import { isDesignV3 } from "@/lib/needt3/design-flag";
import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("settings");

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // design_v3: Settings is a sheet over Today; /settings#section opens it.
  if (await isDesignV3()) return <SettingsRedirect />;
  return <SettingsRoute />;
}
