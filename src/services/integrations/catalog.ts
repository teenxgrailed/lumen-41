import { getGoogleCredentials, getOutlookCredentials } from "@/lib/auth";

import { composioProvider } from "./composio-provider";
import type { IntegrationCatalogItem } from "./provider";

/** What an admin adds to switch a connector on (names only, never values). */
export const REQUIRES = {
  google:
    "a Google client ID and secret (System settings, or GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)",
  outlook:
    "a Microsoft client ID and secret (System settings, or AZURE_AD_CLIENT_ID and AZURE_AD_CLIENT_SECRET)",
  composio: "COMPOSIO_API_KEY in the server environment",
} as const;

/**
 * Google and Microsoft credentials come from System settings first and the
 * environment second, the same lookup the OAuth start routes use
 * (`getGoogleCredentials`, `getOutlookCredentials`). The catalog used to read
 * the environment alone (and `OUTLOOK_CLIENT_*`, which nothing else reads), so
 * a server configured in System settings still reported "not set up".
 */
async function nativeIntegrations(): Promise<IntegrationCatalogItem[]> {
  const [google, outlook] = await Promise.all([
    getGoogleCredentials().catch(() => null),
    getOutlookCredentials().catch(() => null),
  ]);
  const googleOk = Boolean(google?.clientId && google?.clientSecret);
  const outlookOk = Boolean(outlook?.clientId && outlook?.clientSecret);
  return [
    {
      slug: "google-calendar",
      name: "Google Calendar",
      description: "Realtime calendar sync",
      category: "calendar",
      native: true,
      configured: googleOk,
      requires: googleOk ? undefined : REQUIRES.google,
    },
    {
      slug: "outlook-calendar",
      name: "Outlook Calendar",
      description: "Microsoft calendar sync",
      category: "calendar",
      native: true,
      configured: outlookOk,
      requires: outlookOk ? undefined : REQUIRES.outlook,
    },
    {
      slug: "icloud-calendar",
      name: "Apple / iCloud",
      description: "Private CalDAV calendar sync",
      category: "calendar",
      native: true,
      configured: true,
    },
    {
      slug: "needt-api",
      name: "Needt API",
      description: "Connect scripts and personal automations",
      category: "developer",
      native: true,
      configured: true,
    },
  ];
}

/**
 * The connector catalog. `requires` (what to add on the server) goes only to
 * admins; everyone else just learns that a connector is not available.
 */
export async function getIntegrationCatalog(
  options: { admin?: boolean } = {}
): Promise<IntegrationCatalogItem[]> {
  const [native, toolkits] = await Promise.all([
    nativeIntegrations(),
    composioProvider.listCatalog(),
  ]);
  const all: IntegrationCatalogItem[] = [
    ...native,
    ...toolkits.map((item) => ({
      ...item,
      requires: item.configured ? undefined : REQUIRES.composio,
    })),
  ];
  if (options.admin) return all;
  return all.map((item) => {
    const publicItem = { ...item };
    delete publicItem.requires;
    return publicItem;
  });
}
