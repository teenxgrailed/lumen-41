import {
  SafeFetchError,
  type Transport,
  type TransportResponse,
  assertPublicHttpsUrl,
  guardedLookup,
  isPrivateAddress,
  safeDownload,
} from "../safe-fetch";

const PUBLIC = async () => ["93.184.216.34"];

function response(
  status: number,
  chunks: string[] = [],
  headers: Record<string, string> = {}
): TransportResponse & { destroyed: boolean } {
  const out = {
    status,
    headers,
    destroyed: false,
    destroy() {
      out.destroyed = true;
    },
    body: (async function* () {
      for (const chunk of chunks) yield Buffer.from(chunk);
    })(),
  };
  return out;
}

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::a00:1",
    "2002:7f00:1::",
    "not-an-ip",
  ])("refuses %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each([
    "93.184.216.34",
    "8.8.8.8",
    "172.15.0.1",
    "172.32.0.1",
    "52.216.1.1",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
  ])("allows %s", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});

describe("assertPublicHttpsUrl", () => {
  const blocked = (url: string, resolve = PUBLIC) =>
    assertPublicHttpsUrl(url, resolve).catch((e: unknown) => e);

  it("accepts a public https URL", async () => {
    await expect(
      assertPublicHttpsUrl("https://files.example.com/a.png?x=1", PUBLIC)
    ).resolves.toBeInstanceOf(URL);
  });

  it.each([
    "http://files.example.com/a.png",
    "ftp://files.example.com/a",
    "file:///etc/passwd",
    "https://user:pw@files.example.com/a",
    "https://files.example.com:8443/a",
    "https://127.0.0.1/a",
    "https://[::1]/a",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.5/a",
    "not a url",
  ])("refuses %s", async (url) => {
    const error = await blocked(url);
    expect(error).toBeInstanceOf(SafeFetchError);
    expect((error as SafeFetchError).code).toBe("blocked_url");
  });

  it("refuses a name that resolves to a private address, even if one answer is public", async () => {
    const error = await blocked("https://evil.example.com/a", async () => [
      "93.184.216.34",
      "10.0.0.1",
    ]);
    expect((error as SafeFetchError).code).toBe("blocked_url");
    const localhost = await blocked(
      "https://internal.example.com/a",
      async () => ["127.0.0.1"]
    );
    expect((localhost as SafeFetchError).code).toBe("blocked_url");
  });

  it("reports an unresolvable host as a network failure", async () => {
    const error = await blocked("https://nope.example.com/a", async () => {
      throw new Error("ENOTFOUND");
    });
    expect((error as SafeFetchError).code).toBe("network");
  });
});

describe("guardedLookup", () => {
  it("refuses to connect to what localhost resolves to", async () => {
    const result = await new Promise<NodeJS.ErrnoException | null>((resolve) =>
      guardedLookup("localhost", {}, (error) => resolve(error))
    );
    expect(result?.code).toBe("EBLOCKED");
  });
});

describe("safeDownload", () => {
  const options = { maxBytes: 10, resolve: PUBLIC };

  it("downloads within the cap", async () => {
    const transport: Transport = jest
      .fn()
      .mockResolvedValue(
        response(200, ["hello", "!"], { "content-type": "text/plain" })
      );
    const file = await safeDownload("https://files.example.com/a.txt", {
      ...options,
      transport,
    });
    expect(file.bytes.toString()).toBe("hello!");
    expect(file.contentType).toBe("text/plain");
  });

  it("refuses a file whose declared size is over the cap without reading it", async () => {
    const res = response(200, ["x"], { "content-length": "11" });
    const error = await safeDownload("https://files.example.com/a", {
      ...options,
      transport: async () => res,
    }).catch((e) => e);
    expect(error.code).toBe("too_large");
    expect(res.destroyed).toBe(true);
  });

  it("stops a stream that outgrows the cap", async () => {
    const res = response(200, ["123456", "789012"]);
    const error = await safeDownload("https://files.example.com/a", {
      ...options,
      transport: async () => res,
    }).catch((e) => e);
    expect(error.code).toBe("too_large");
    expect(res.destroyed).toBe(true);
  });

  it("follows a redirect to another public host", async () => {
    const transport = jest
      .fn()
      .mockResolvedValueOnce(
        response(302, [], { location: "https://cdn.example.com/real.png" })
      )
      .mockResolvedValueOnce(response(200, ["ok"]));
    const file = await safeDownload("https://files.example.com/a", {
      ...options,
      transport,
    });
    expect(file.finalUrl).toBe("https://cdn.example.com/real.png");
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("refuses a redirect into a private range or to http", async () => {
    for (const location of [
      "https://169.254.169.254/latest",
      "http://cdn.example.com/a",
      "https://10.0.0.1/a",
    ]) {
      const transport = jest
        .fn()
        .mockResolvedValue(response(301, [], { location }));
      const error = await safeDownload("https://files.example.com/a", {
        ...options,
        transport,
      }).catch((e) => e);
      expect(error.code).toBe("blocked_url");
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });

  it("refuses a redirect to a name that resolves privately", async () => {
    const resolve = async (host: string) =>
      host === "files.example.com" ? ["93.184.216.34"] : ["192.168.0.9"];
    const transport = jest
      .fn()
      .mockResolvedValue(
        response(302, [], { location: "https://rebind.example.com/a" })
      );
    const error = await safeDownload("https://files.example.com/a", {
      maxBytes: 10,
      resolve,
      transport,
    }).catch((e) => e);
    expect(error.code).toBe("blocked_url");
  });

  it("stops after too many redirects", async () => {
    const transport = jest
      .fn()
      .mockImplementation(async () =>
        response(302, [], { location: "https://files.example.com/loop" })
      );
    const error = await safeDownload("https://files.example.com/a", {
      ...options,
      transport,
    }).catch((e) => e);
    expect(error.code).toBe("too_many_redirects");
  });

  it("reports a failing server and a failing connection", async () => {
    const status = await safeDownload("https://files.example.com/a", {
      ...options,
      transport: async () => response(403),
    }).catch((e) => e);
    expect(status.code).toBe("bad_status");
    const network = await safeDownload("https://files.example.com/a", {
      ...options,
      transport: async () => {
        throw new Error("ECONNRESET");
      },
    }).catch((e) => e);
    expect(network.code).toBe("network");
  });

  it("never connects to a private address given directly", async () => {
    const transport = jest.fn();
    const error = await safeDownload("https://127.0.0.1/a", {
      ...options,
      transport,
    }).catch((e) => e);
    expect(error.code).toBe("blocked_url");
    expect(transport).not.toHaveBeenCalled();
  });

  describe("allowHost", () => {
    const notionOnly = (host: string) => host.endsWith(".notion.so");

    it("refuses a first address on a host the caller does not allow, before connecting", async () => {
      const transport = jest.fn();
      const resolve = jest.fn(PUBLIC);
      const error = await safeDownload("https://files.example.com/a", {
        ...options,
        resolve,
        transport,
        allowHost: notionOnly,
      }).catch((e) => e);
      expect(error.code).toBe("blocked_url");
      expect(transport).not.toHaveBeenCalled();
      expect(resolve).not.toHaveBeenCalled();
    });

    it("follows a redirect that stays on allowed hosts", async () => {
      const transport = jest
        .fn()
        .mockResolvedValueOnce(
          response(302, [], { location: "https://cdn.notion.so/real.png" })
        )
        .mockResolvedValueOnce(response(200, ["ok"]));
      const file = await safeDownload("https://file.notion.so/a", {
        ...options,
        transport,
        allowHost: notionOnly,
      });
      expect(file.finalUrl).toBe("https://cdn.notion.so/real.png");
      expect(transport).toHaveBeenCalledTimes(2);
    });

    it("refuses a redirect to a public host that is not allowed, on any hop", async () => {
      const first = jest
        .fn()
        .mockResolvedValue(
          response(302, [], { location: "https://evil.example.com/a" })
        );
      const error = await safeDownload("https://file.notion.so/a", {
        ...options,
        transport: first,
        allowHost: notionOnly,
      }).catch((e) => e);
      expect(error.code).toBe("blocked_url");
      expect(first).toHaveBeenCalledTimes(1);

      // Allowed, then allowed, then off-site: refused on the third hop.
      const chain = jest
        .fn()
        .mockResolvedValueOnce(
          response(302, [], { location: "https://a.notion.so/1" })
        )
        .mockResolvedValueOnce(
          response(302, [], { location: "https://evil.example.com/2" })
        )
        .mockResolvedValue(response(200, ["never"]));
      const later = await safeDownload("https://file.notion.so/a", {
        ...options,
        transport: chain,
        allowHost: notionOnly,
      }).catch((e) => e);
      expect(later.code).toBe("blocked_url");
      expect(chain).toHaveBeenCalledTimes(2);
    });

    it("checks the host in lower case", async () => {
      const transport = jest.fn().mockResolvedValue(response(200, ["ok"]));
      await safeDownload("https://FILE.Notion.SO/a", {
        ...options,
        transport,
        allowHost: notionOnly,
      });
      expect(transport).toHaveBeenCalledTimes(1);
    });
  });
});
