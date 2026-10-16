import { publicAppUrl, publicRequestUrl } from "@/lib/public-url";

const request = {
  nextUrl: {
    pathname: "/calendar",
    search: "?view=week",
  },
  url: "http://0.0.0.0:3000/calendar?view=week",
};

describe("public URL helpers", () => {
  const originalNextAuthUrl = process.env.NEXTAUTH_URL;

  afterEach(() => {
    if (originalNextAuthUrl === undefined) {
      delete process.env.NEXTAUTH_URL;
    } else {
      process.env.NEXTAUTH_URL = originalNextAuthUrl;
    }
  });

  it("uses NEXTAUTH_URL instead of an internal reverse-proxy hostname", () => {
    process.env.NEXTAUTH_URL = "https://use.needt.app";

    expect(publicRequestUrl(request).toString()).toBe(
      "https://use.needt.app/calendar?view=week"
    );
    expect(publicAppUrl("/auth/signin", request).toString()).toBe(
      "https://use.needt.app/auth/signin"
    );
  });

  it("uses forwarded headers before the internal request origin", () => {
    delete process.env.NEXTAUTH_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const headers = new Headers({
      "x-forwarded-host": "use.needt.app",
      "x-forwarded-proto": "https",
    });
    expect(publicAppUrl("/mail", { ...request, headers }).toString()).toBe(
      "https://use.needt.app/mail"
    );
  });

  it("falls back to the request origin when NEXTAUTH_URL is unavailable", () => {
    delete process.env.NEXTAUTH_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;

    expect(publicRequestUrl(request).toString()).toBe(
      "http://0.0.0.0:3000/calendar?view=week"
    );
  });
});
