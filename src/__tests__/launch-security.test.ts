import { NextRequest } from "next/server";

import { assertCalDAVRequestUrl } from "@/lib/caldav-calendar";
import {
  validateGoogleWebhookHeaders,
  validateOutlookNotification,
} from "@/lib/calendar-webhooks/validation";
import { requireCronSecret, secretsMatch } from "@/lib/cron/auth";

import * as catchAll from "@/app/api/[...missing]/route";
import { assertPublicHost } from "@/services/oauth/safe-fetch";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/logger", () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/services/oauth/safe-fetch", () => {
  class UnsafeFetchError extends Error {}
  return {
    UnsafeFetchError,
    assertPublicHost: jest.fn(async (host: string) => {
      if (host === "internal.test" || host === "169.254.169.254") {
        throw new UnsafeFetchError("non-public");
      }
    }),
  };
});

describe("CalDAV request guard", () => {
  const account = "https://dav.example.com/dav/";

  it("re-checks the host is public on every request", async () => {
    await expect(
      assertCalDAVRequestUrl("https://dav.example.com/dav/c/e.ics", account)
    ).resolves.toBe("https://dav.example.com/dav/c/e.ics");
    expect(assertPublicHost).toHaveBeenCalledWith("dav.example.com");

    // The stored host turning internal later (DNS change) is refused.
    await expect(
      assertCalDAVRequestUrl(
        "http://internal.test/e.ics",
        "http://internal.test/dav/"
      )
    ).rejects.toThrow("non-public");
  });

  it("refuses a server-returned href on another origin", async () => {
    await expect(
      assertCalDAVRequestUrl("http://169.254.169.254/latest/", account)
    ).rejects.toThrow("points away");
    await expect(
      assertCalDAVRequestUrl("https://evil.example.org/e.ics", account)
    ).rejects.toThrow("points away");
  });

  it("resolves a relative href against the account server", async () => {
    await expect(
      assertCalDAVRequestUrl("/calendars/u/cal/e.ics", account)
    ).resolves.toBe("https://dav.example.com/calendars/u/cal/e.ics");
  });

  it("refuses non-http schemes and an unparseable account URL", async () => {
    await expect(
      assertCalDAVRequestUrl("file:///etc/passwd", account)
    ).rejects.toThrow();
    await expect(assertCalDAVRequestUrl("/x.ics", null)).rejects.toThrow(
      "not a valid URL"
    );
  });
});

describe("constant-time secret compare", () => {
  it("matches equal values and rejects everything else", () => {
    expect(secretsMatch("abc", "abc")).toBe(true);
    expect(secretsMatch("abd", "abc")).toBe(false);
    expect(secretsMatch("ab", "abc")).toBe(false);
    expect(secretsMatch("", "")).toBe(false);
    expect(secretsMatch(null, "abc")).toBe(false);
    expect(secretsMatch("abc", null)).toBe(false);
  });

  it("guards the cron secret", () => {
    process.env.CRON_SECRET = "s3cret";
    const call = (headers: Record<string, string>) =>
      requireCronSecret(new NextRequest("http://x.test/api/cron", { headers }));
    expect(call({ "x-cron-secret": "s3cret" })).toBeNull();
    expect(call({ authorization: "Bearer s3cret" })).toBeNull();
    expect(call({ "x-cron-secret": "s3cret!" })?.status).toBe(401);
    expect(call({})?.status).toBe(401);
  });

  it("validates webhook tokens", () => {
    const hook = {
      channelId: "c1",
      resourceId: "r1",
      channelToken: "t1",
    };
    const good = new Headers({
      "x-goog-channel-id": "c1",
      "x-goog-resource-id": "r1",
      "x-goog-channel-token": "t1",
    });
    expect(validateGoogleWebhookHeaders(good, hook)).toBe(true);
    const bad = new Headers(good);
    bad.set("x-goog-channel-token", "t2");
    expect(validateGoogleWebhookHeaders(bad, hook)).toBe(false);
    expect(validateGoogleWebhookHeaders(new Headers(), hook)).toBe(false);

    const sub = { subscriptionId: "s1", clientState: "k1" };
    expect(
      validateOutlookNotification({ subscriptionId: "s1", clientState: "k1" }, sub)
    ).toBe(true);
    expect(
      validateOutlookNotification({ subscriptionId: "s1", clientState: "k2" }, sub)
    ).toBe(false);
    expect(validateOutlookNotification({}, sub)).toBe(false);
  });
});

describe("unknown API routes", () => {
  it("answer 404 JSON for every method", async () => {
    for (const handler of [
      catchAll.GET,
      catchAll.POST,
      catchAll.PUT,
      catchAll.PATCH,
      catchAll.DELETE,
      catchAll.OPTIONS,
    ]) {
      const response = handler();
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    }
  });
});
