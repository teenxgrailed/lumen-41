import { NextRequest } from "next/server";

import { middleware } from "@/middleware";

import { safeCallbackPath } from "@/lib/auth/callback-url";

describe("checkout deep link while signed out", () => {
  it.each(["pro-year", "pro-month", "lifetime"])(
    "sends /settings?section=billing&checkout=%s to sign-in with the exact URL",
    async (checkout) => {
      const link = `/settings?section=billing&checkout=${checkout}`;
      const response = await middleware(
        new NextRequest(`http://needt.test${link}`)
      );

      const location = response.headers.get("location");
      expect(location).not.toBeNull();
      const redirect = new URL(location!);
      expect(redirect.pathname).toBe("/auth/signin");
      const callbackUrl = redirect.searchParams.get("callbackUrl");
      expect(callbackUrl).toBe(link);
      // ... and the sign-in screen accepts it unchanged.
      expect(safeCallbackPath(callbackUrl)).toBe(link);
    }
  );
});
