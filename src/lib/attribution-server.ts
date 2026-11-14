import { cookies } from "next/headers";

import {
  UTM_COOKIE,
  type UtmTags,
  utmFromCookieHeader,
} from "@/lib/attribution";

/**
 * The campaign tags of the request being served, from the `needt_utm`
 * cookie. Empty outside a request (tests, workers) or without the cookie;
 * never throws.
 */
export async function requestUtm(): Promise<UtmTags> {
  try {
    const value = (await cookies()).get(UTM_COOKIE)?.value;
    return value
      ? utmFromCookieHeader(`${UTM_COOKIE}=${encodeURIComponent(value)}`)
      : {};
  } catch {
    return {};
  }
}
