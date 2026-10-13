import { cookies, headers } from "next/headers";

import {
  PHONE_UI_COOKIE,
  type PhoneUi,
  parseUiCookie,
  phoneUiFrom,
} from "./phone-ui";

/**
 * The server's pick of face for a page with no signed-in frame around it
 * (sign-in, the reset and confirm links): the `needt-ui` cookie, else
 * Sec-CH-UA-Mobile, else the user agent. The width takes over after
 * hydration unless the cookie pinned a side (`uiForced`).
 */
export async function requestPhoneUi(): Promise<{
  initialUi: PhoneUi;
  uiForced: boolean;
}> {
  const [reqHeaders, jar] = await Promise.all([headers(), cookies()]);
  const uiCookie = jar.get(PHONE_UI_COOKIE)?.value;
  return {
    initialUi: phoneUiFrom({
      secChUaMobile: reqHeaders.get("sec-ch-ua-mobile"),
      userAgent: reqHeaders.get("user-agent"),
      cookie: uiCookie,
    }),
    uiForced: parseUiCookie(uiCookie) !== null,
  };
}
