import {
  appRedirectUrl,
  publicAppUrl,
  publicRequestUrl,
} from "@/lib/public-url";

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

  it("never builds an http redirect for a public host", () => {
    process.env.NEXTAUTH_URL = "http://use.needt.app";
    expect(publicAppUrl("/auth/signin", request).toString()).toBe(
      "https://use.needt.app/auth/signin"
    );
    delete process.env.NEXTAUTH_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const headers = new Headers({
      "x-forwarded-host": "use.needt.app",
      "x-forwarded-proto": "http",
    });
    expect(publicAppUrl("/mail", { ...request, headers }).toString()).toBe(
      "https://use.needt.app/mail"
    );
  });

  it("redirects inside the app on the loopback host the browser asked for", () => {
    // the installed app on 127.0.0.1 must not be sent to localhost: that is
    // another origin, outside the app's scope
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    const headers = new Headers({ host: "127.0.0.1:3000" });
    expect(
      appRedirectUrl("/auth/signin", { ...request, headers }).toString()
    ).toBe("http://127.0.0.1:3000/auth/signin");
    process.env.NEXTAUTH_URL = "https://use.needt.app";
    expect(appRedirectUrl("/today", { ...request, headers }).toString()).toBe(
      "http://127.0.0.1:3000/today"
    );
  });

  it("never trusts a loopback request.url behind the production proxy", () => {
    process.env.NEXTAUTH_URL = "https://use.needt.app";
    const headers = new Headers({ host: "use.needt.app" });
    const internal = {
      ...request,
      url: "http://localhost:3000/calendar",
      headers,
    };
    expect(appRedirectUrl("/auth/signin", internal).toString()).toBe(
      "https://use.needt.app/auth/signin"
    );
    expect(
      appRedirectUrl("/auth/signin", {
        ...request,
        url: "http://localhost:3000/x",
      }).toString()
    ).toBe("https://use.needt.app/auth/signin");
  });

  it("keeps http for local development", () => {
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    expect(publicAppUrl("/today", request).toString()).toBe(
      "http://localhost:3000/today"
    );
  });
});
