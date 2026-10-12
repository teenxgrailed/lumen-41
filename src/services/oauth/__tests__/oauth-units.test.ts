import { clientOrigin, isTrustedClientHost } from "@/services/oauth/clients";
import { grantedScopes } from "@/services/oauth/consent";
import { parseScopes } from "@/services/oauth/constants";
import { isCodeChallenge, verifyPkce } from "@/services/oauth/crypto";
import {
  isAllowedRedirectUri,
  matchesRegisteredRedirect,
} from "@/services/oauth/redirect-uri";
import {
  type SafeFetchDeps,
  type SafeFetchResponse,
  UnsafeFetchError,
  isPrivateAddress,
  safeFetchJson,
} from "@/services/oauth/safe-fetch";
import crypto from "crypto";

const verifier = "a".repeat(20) + "-._~" + "B".repeat(25);
const challenge = crypto
  .createHash("sha256")
  .update(verifier)
  .digest("base64url");

describe("PKCE S256", () => {
  it("accepts the verifier that hashes to the challenge", () => {
    expect(isCodeChallenge(challenge)).toBe(true);
    expect(verifyPkce(verifier, challenge)).toBe(true);
  });

  it("refuses another verifier, a plain challenge and malformed input", () => {
    expect(verifyPkce(`${verifier}x`, challenge)).toBe(false);
    expect(verifyPkce(verifier, verifier.slice(0, 43))).toBe(false);
    expect(verifyPkce("short", challenge)).toBe(false);
    expect(verifyPkce(verifier, "not a challenge")).toBe(false);
  });
});

describe("redirect URIs", () => {
  it("allows https anywhere and http only on loopback", () => {
    for (const ok of [
      "https://claude.ai/api/mcp/auth_callback",
      "http://127.0.0.1:33418/callback",
      "http://localhost/callback",
      "http://[::1]:9000/cb",
    ]) {
      expect(isAllowedRedirectUri(ok)).toBe(true);
    }
    for (const bad of [
      "http://example.com/cb",
      "javascript:alert(1)",
      "https://claude.ai/cb#frag",
      "https://user:pass@claude.ai/cb",
      "myapp://callback",
      "not a url",
    ]) {
      expect(isAllowedRedirectUri(bad)).toBe(false);
    }
  });

  it("matches exactly, except any port on a loopback redirect", () => {
    const registered = [
      "https://claude.ai/api/mcp/auth_callback",
      "http://127.0.0.1/callback",
    ];
    expect(
      matchesRegisteredRedirect(
        "https://claude.ai/api/mcp/auth_callback",
        registered
      )
    ).toBe(true);
    expect(
      matchesRegisteredRedirect("http://127.0.0.1:54321/callback", registered)
    ).toBe(true);
    expect(
      matchesRegisteredRedirect("http://127.0.0.1:1/callback", registered)
    ).toBe(true);
    // Not a free-for-all: path, host and scheme still count.
    expect(
      matchesRegisteredRedirect("http://127.0.0.1:54321/other", registered)
    ).toBe(false);
    expect(
      matchesRegisteredRedirect("http://localhost:54321/callback", registered)
    ).toBe(false);
    expect(
      matchesRegisteredRedirect(
        "https://claude.ai/api/mcp/auth_callback/../x",
        registered
      )
    ).toBe(false);
    expect(
      matchesRegisteredRedirect(
        "https://claude.ai.evil.example/api/mcp/auth_callback",
        registered
      )
    ).toBe(false);
    expect(
      matchesRegisteredRedirect(
        "https://claude.ai:8443/api/mcp/auth_callback",
        registered
      )
    ).toBe(false);
  });
});

describe("scopes", () => {
  it("parses known scopes and refuses unknown ones", () => {
    expect(parseScopes("needt.read  mail.read")).toEqual([
      "needt.read",
      "mail.read",
    ]);
    expect(parseScopes("")).toEqual([]);
    expect(parseScopes("needt.read admin")).toBeNull();
  });

  it("grants read as the floor, write and mail only when asked and ticked", () => {
    const all = ["needt.read", "needt.write", "mail.read"] as const;
    expect(grantedScopes(all, { write: true, mail: false })).toEqual([
      "needt.read",
      "needt.write",
    ]);
    expect(grantedScopes(all, { write: false, mail: true })).toEqual([
      "needt.read",
      "mail.read",
    ]);
    expect(grantedScopes(["needt.read"], { write: true, mail: true })).toEqual([
      "needt.read",
    ]);
  });
});

describe("who a client is, on the consent page", () => {
  it("names the CIMD host, trusted only for known clients", () => {
    expect(
      clientOrigin(
        { kind: "cimd", clientId: "https://claude.ai/oauth/mcp-client.json" },
        "https://claude.ai/api/mcp/auth_callback"
      )
    ).toEqual({ host: "claude.ai", trusted: true });
    expect(
      clientOrigin(
        { kind: "cimd", clientId: "https://claude.ai.evil.example/c.json" },
        "https://claude.ai.evil.example/cb"
      )
    ).toEqual({ host: "claude.ai.evil.example", trusted: false });
    expect(isTrustedClientHost("chatgpt.com")).toBe(true);
    expect(isTrustedClientHost("evilchatgpt.com")).toBe(false);
  });

  it("names a self-registered client by where it returns, never trusted", () => {
    expect(
      clientOrigin(
        { kind: "dcr", clientId: "ndt_client_x" },
        "https://claude.ai/api/mcp/auth_callback"
      )
    ).toEqual({ host: "claude.ai", trusted: false });
  });
});

describe("CIMD fetch SSRF protection", () => {
  it("knows private and reserved addresses", () => {
    for (const ip of [
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
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "64:ff9b::a00:1",
      "::a00:1",
      "64:ff9b:1::1",
      "2001:0:4136:e378::1",
      "fec0::1",
      "2002:a00:1::",
    ]) {
      expect([ip, isPrivateAddress(ip)]).toEqual([ip, true]);
    }
    for (const ip of [
      "8.8.8.8",
      "1.1.1.1",
      "172.32.0.1",
      "2606:4700:4700::1111",
    ]) {
      expect([ip, isPrivateAddress(ip)]).toEqual([ip, false]);
    }
  });

  function deps(
    dns: Record<string, string[]>,
    responses: Record<string, SafeFetchResponse>
  ): SafeFetchDeps & { fetched: string[] } {
    const fetched: string[] = [];
    return {
      fetched,
      lookup: async (host) => dns[host] ?? [],
      get: async (url, address) => {
        fetched.push(`${url.toString()}@${address}`);
        const response = responses[url.toString()];
        if (!response) throw new Error("unexpected fetch");
        return response;
      },
    };
  }
  const json = (value: unknown): SafeFetchResponse => ({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: Buffer.from(JSON.stringify(value)),
  });

  it("fetches a public https document and pins the checked address", async () => {
    const d = deps(
      { "client.example": ["93.184.216.34"] },
      {
        "https://client.example/meta.json": json({ ok: true }),
      }
    );
    await expect(
      safeFetchJson("https://client.example/meta.json", { deps: d })
    ).resolves.toEqual({ ok: true });
    expect(d.fetched).toEqual([
      "https://client.example/meta.json@93.184.216.34",
    ]);
  });

  it("refuses a host that resolves to a private address, even one of several", async () => {
    const d = deps({ "evil.example": ["93.184.216.34", "10.0.0.5"] }, {});
    await expect(
      safeFetchJson("https://evil.example/meta.json", { deps: d })
    ).rejects.toBeInstanceOf(UnsafeFetchError);
    expect(d.fetched).toEqual([]);
  });

  it("refuses literal private IPs, http, other ports and credentials", async () => {
    const d = deps({}, {});
    for (const url of [
      "https://127.0.0.1/meta.json",
      "https://[::1]/meta.json",
      "https://169.254.169.254/latest/meta-data",
      "http://client.example/meta.json",
      "https://client.example:8443/meta.json",
      "https://user:pw@client.example/meta.json",
    ]) {
      await expect(safeFetchJson(url, { deps: d })).rejects.toBeInstanceOf(
        UnsafeFetchError
      );
    }
    expect(d.fetched).toEqual([]);
  });

  it("refuses a redirect to a private address", async () => {
    const d = deps(
      {
        "client.example": ["93.184.216.34"],
        "internal.example": ["192.168.0.10"],
      },
      {
        "https://client.example/meta.json": {
          status: 302,
          location: "https://internal.example/meta.json",
          body: Buffer.alloc(0),
        },
      }
    );
    await expect(
      safeFetchJson("https://client.example/meta.json", { deps: d })
    ).rejects.toThrow("non-public");
    expect(d.fetched).toEqual([
      "https://client.example/meta.json@93.184.216.34",
    ]);
  });

  it("refuses a redirect to http and too many redirects", async () => {
    const hop = (to: string): SafeFetchResponse => ({
      status: 301,
      location: to,
      body: Buffer.alloc(0),
    });
    const toHttp = deps(
      { "a.example": ["93.184.216.34"] },
      { "https://a.example/m": hop("http://a.example/m") }
    );
    await expect(
      safeFetchJson("https://a.example/m", { deps: toHttp })
    ).rejects.toThrow("https");
    const loop = deps(
      { "a.example": ["93.184.216.34"] },
      {
        "https://a.example/1": hop("/2"),
        "https://a.example/2": hop("/3"),
        "https://a.example/3": hop("/4"),
      }
    );
    await expect(
      safeFetchJson("https://a.example/1", { deps: loop })
    ).rejects.toThrow("Too many redirects");
  });

  it("refuses a document that is not served as JSON", async () => {
    const d = deps(
      { "client.example": ["93.184.216.34"] },
      {
        "https://client.example/meta.json": {
          status: 200,
          contentType: "text/html",
          body: Buffer.from("{}"),
        },
      }
    );
    await expect(
      safeFetchJson("https://client.example/meta.json", { deps: d })
    ).rejects.toThrow("not served as JSON");
  });

  it("gives up at the total deadline when the body drips slowly", async () => {
    const started = Date.now();
    const d: SafeFetchDeps = {
      lookup: async () => ["93.184.216.34"],
      // A server that never finishes the response.
      get: () => new Promise(() => {}),
    };
    await expect(
      safeFetchJson("https://slow.example/meta.json", {
        deps: d,
        timeoutMs: 80,
      })
    ).rejects.toThrow("timed out");
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("gives up at the total deadline when DNS hangs", async () => {
    const d: SafeFetchDeps = {
      lookup: () => new Promise(() => {}),
      get: jest.fn(),
    };
    await expect(
      safeFetchJson("https://slow-dns.example/meta.json", {
        deps: d,
        timeoutMs: 80,
      })
    ).rejects.toThrow("timed out");
    expect(d.get).not.toHaveBeenCalled();
  });

  it("counts every redirect hop against one deadline", async () => {
    let calls = 0;
    const d: SafeFetchDeps = {
      lookup: async () => ["93.184.216.34"],
      get: async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          status: 302,
          location: `/hop-${calls}`,
          body: Buffer.alloc(0),
        };
      },
    };
    await expect(
      safeFetchJson("https://hops.example/meta.json", {
        deps: d,
        timeoutMs: 120,
        maxRedirects: 5,
      })
    ).rejects.toThrow("timed out");
    expect(calls).toBeLessThanOrEqual(3);
  });

  it("refuses an oversized document", async () => {
    const d = deps(
      { "big.example": ["93.184.216.34"] },
      {
        "https://big.example/meta.json": {
          status: 200,
          body: Buffer.alloc(70 * 1024, 32),
        },
      }
    );
    await expect(
      safeFetchJson("https://big.example/meta.json", { deps: d })
    ).rejects.toThrow("too large");
  });
});
