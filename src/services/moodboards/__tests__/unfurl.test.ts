import type {
  Transport,
  TransportResponse,
} from "@/services/imports/safe-fetch";

import { parseLinkPreview, unfurlLink } from "../unfurl";

const body = (...chunks: Uint8Array[]) =>
  (async function* () {
    for (const c of chunks) yield c;
  })();

const answer = (
  status: number,
  headers: Record<string, string>,
  ...chunks: Uint8Array[]
): TransportResponse => ({
  status,
  headers,
  body: body(...chunks),
  destroy: jest.fn(),
});

const page =
  (html: string, type = "text/html; charset=utf-8"): Transport =>
  async () =>
    answer(200, { "content-type": type }, new TextEncoder().encode(html));

/** Resolves every name to a public address, so only the checks under test matter. */
const publicDns = async () => ["93.184.216.34"];

describe("parseLinkPreview", () => {
  it("reads Open Graph first", () => {
    const p = parseLinkPreview(
      `<html><head><title>Fallback</title>
       <meta property="og:title" content="Boxy &amp; wool &#39;overshirt&#39;">
       <meta property="og:site_name" content="SSENSE">
       <meta property="og:image" content="/img/a.jpg">
       <meta name="twitter:title" content="Tw"></head><body>x</body></html>`,
      "https://www.ssense.com/en/p/1"
    );
    expect(p).toEqual({
      title: "Boxy & wool 'overshirt'",
      siteName: "SSENSE",
      thumbnailUrl: "https://www.ssense.com/img/a.jpg",
    });
  });

  it("falls back to the Twitter card, then <title>", () => {
    expect(
      parseLinkPreview(
        `<head><meta name="twitter:title" content="Tw"><meta name="twitter:image" content="https://i.example.com/t.png"></head>`,
        "https://x.com/"
      )
    ).toMatchObject({
      title: "Tw",
      thumbnailUrl: "https://i.example.com/t.png",
    });
    expect(
      parseLinkPreview(
        `<head><title>\n  Plain   title </title></head>`,
        "https://x.com/"
      ).title
    ).toBe("Plain title");
  });

  it("keeps only an https picture (http would be mixed content)", () => {
    expect(
      parseLinkPreview(
        `<head><meta property="og:image" content="http://i.example.com/a.jpg"></head>`,
        "https://x.com/"
      ).thumbnailUrl
    ).toBeNull();
    expect(
      parseLinkPreview(
        `<head><meta property="og:image" content="javascript:alert(1)"></head>`,
        "https://x.com/"
      ).thumbnailUrl
    ).toBeNull();
  });

  it("clips what it keeps", () => {
    const p = parseLinkPreview(
      `<head><meta property="og:title" content="${"a".repeat(500)}"></head>`,
      "https://x.com/"
    );
    expect(p.title).toHaveLength(240);
  });

  it("finds nothing in a page with no tags", () => {
    expect(
      parseLinkPreview("<html><body>hi</body></html>", "https://x.com/")
    ).toEqual({
      title: null,
      siteName: null,
      thumbnailUrl: null,
    });
  });
});

describe("unfurlLink", () => {
  it("returns the preview of an HTML page", async () => {
    const p = await unfurlLink("https://example.com/a", {
      transport: page(`<head><title>Hello</title></head>`),
      resolve: publicDns,
    });
    expect(p?.title).toBe("Hello");
  });

  it("returns null for a page that is not HTML", async () => {
    expect(
      await unfurlLink("https://example.com/a.json", {
        transport: page(`{"title":"x"}`, "application/json"),
        resolve: publicDns,
      })
    ).toBeNull();
  });

  it("returns null for a page with no tags at all", async () => {
    expect(
      await unfurlLink("https://example.com/", {
        transport: page("<p>x</p>"),
        resolve: publicDns,
      })
    ).toBeNull();
  });

  describe("SSRF: nothing private is ever requested", () => {
    const never = () => {
      const transport = jest.fn();
      return transport as unknown as Transport & jest.Mock;
    };

    it.each([
      ["a non-https address", "http://example.com/"],
      ["a private IP literal", "https://10.0.0.1/admin"],
      ["loopback", "https://127.0.0.1/"],
      [
        "the cloud metadata address",
        "https://169.254.169.254/latest/meta-data/",
      ],
      ["an IPv6 loopback", "https://[::1]/"],
      ["an IPv4 wrapped in IPv6", "https://[::ffff:127.0.0.1]/"],
      ["a login in the address", "https://user:pw@example.com/"],
      ["another port", "https://example.com:8443/"],
      ["a file", "file:///etc/passwd"],
      ["text that is no address", "nonsense"],
    ])("%s", async (_n, url) => {
      const transport = never();
      expect(
        await unfurlLink(url, { transport, resolve: publicDns })
      ).toBeNull();
      expect(transport).not.toHaveBeenCalled();
    });

    it("a name that resolves to a private address", async () => {
      const transport = never();
      expect(
        await unfurlLink("https://sneaky.example.com/", {
          transport,
          resolve: async () => ["93.184.216.34", "10.0.0.5"],
        })
      ).toBeNull();
      expect(transport).not.toHaveBeenCalled();
    });

    it.each([
      "https://10.0.0.1/",
      "https://169.254.169.254/latest/meta-data/",
      "http://example.com/",
    ])("a redirect to %s stops after the first request", async (to) => {
      const asked: string[] = [];
      const transport: Transport = async (u) => {
        asked.push(u.href);
        return answer(302, { location: to });
      };
      expect(
        await unfurlLink("https://example.com/", {
          transport,
          resolve: publicDns,
        })
      ).toBeNull();
      expect(asked).toEqual(["https://example.com/"]);
    });
  });

  it("returns null for a page over the size cap, and stops reading it", async () => {
    let produced = 0;
    const destroy = jest.fn();
    const transport: Transport = async () => ({
      status: 200,
      headers: { "content-type": "text/html" },
      destroy,
      body: (async function* () {
        for (;;) {
          produced += 1000;
          yield new Uint8Array(1000).fill(65);
        }
      })(),
    });
    expect(
      await unfurlLink("https://example.com/", {
        transport,
        resolve: publicDns,
        maxBytes: 4096,
      })
    ).toBeNull();
    expect(produced).toBeLessThan(10_000);
    expect(destroy).toHaveBeenCalled();
  });

  it("returns null when the page is too slow", async () => {
    const transport: Transport = (_u, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted")))
      );
    expect(
      await unfurlLink("https://example.com/", {
        transport,
        resolve: publicDns,
        timeoutMs: 30,
      })
    ).toBeNull();
  });

  it("returns null when the page stops in the middle of the body", async () => {
    const transport: Transport = async (_u, { signal }) => ({
      status: 200,
      headers: { "content-type": "text/html" },
      destroy: jest.fn(),
      body: (async function* () {
        yield new TextEncoder().encode("<html>");
        await new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted")))
        );
      })(),
    });
    expect(
      await unfurlLink("https://example.com/", {
        transport,
        resolve: publicDns,
        timeoutMs: 30,
      })
    ).toBeNull();
  });

  it("follows a redirect to another public page", async () => {
    const transport: Transport = async (u) =>
      u.pathname === "/a"
        ? answer(301, { location: "/b" })
        : answer(
            200,
            { "content-type": "text/html" },
            new TextEncoder().encode("<head><title>B</title></head>")
          );
    const p = await unfurlLink("https://example.com/a", {
      transport,
      resolve: publicDns,
    });
    expect(p?.title).toBe("B");
  });
});
