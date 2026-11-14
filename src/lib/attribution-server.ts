import { cookies } from "next/headers";

import { type UtmTags, consentedUtmFromCookieHeader } from "@/lib/attribution";

/**
 * The campaign tags of the request being served, from the `needt_utm`
 * cookie, only while the analytics choice is "accepted". Empty outside a
 * request (tests, workers); never throws.
 */
export async function requestUtm(): Promise<UtmTags> {
  try {
    const header = (await cookies())
      .getAll()
      .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
      .join("; ");
    return consentedUtmFromCookieHeader(header);
  } catch {
    return {};
  }
}
