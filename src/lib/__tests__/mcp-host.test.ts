import { NextRequest } from "next/server";

import {
  GET as metadataGet,
  OPTIONS as metadataOptions,
} from "@/app/.well-known/oauth-protected-resource/[[...path]]/route";
import { middleware } from "@/middleware";

import {
  mcpHost,
  mcpResource,
  mcpResourceMetadataUrl,
  oauthIssuer,
} from "@/lib/mcp-config";

jest.mock("next-auth/jwt", () => ({
  getToken: jest.fn().mockResolvedValue(null),
}));

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

function metadata(path?: string[]) {
  return metadataGet(
    new NextRequest(
      "https://mcp.needt.app/.well-known/oauth-protected-resource"
    ),
    { params: Promise.resolve(path ? { path } : {}) }
  );
}

function at(url: string, headers: Record<string, string> = {}) {
  return middleware(new NextRequest(url, { headers }));
}

describe("MCP resource configuration", () => {
  it("defaults to the production hosts", () => {
    delete process.env.MCP_RESOURCE_URL;
    delete process.env.OAUTH_ISSUER_URL;
    process.env.NEXTAUTH_URL = "https://use.needt.app";
    expect(mcpResource()).toBe("https://mcp.needt.app/mcp");
    expect(mcpHost()).toBe("mcp.needt.app");
    expect(oauthIssuer()).toBe("https://use.needt.app");
    expect(mcpResourceMetadataUrl()).toBe(
      "https://mcp.needt.app/.well-known/oauth-protected-resource/mcp"
    );
  });

  it("can be pointed elsewhere from the environment", () => {
    process.env.MCP_RESOURCE_URL = "https://mcp.staging.example/mcp";
    process.env.OAUTH_ISSUER_URL = "https://staging.example";
    expect(mcpHost()).toBe("mcp.staging.example");
    expect(oauthIssuer()).toBe("https://staging.example");
  });
});

describe("protected resource metadata (RFC 9728)", () => {
  it("describes the canonical resource at both well-known paths", async () => {
    process.env.NEXTAUTH_URL = "https://use.needt.app";
    for (const path of [undefined, ["mcp"]]) {
      const response = await metadata(path);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        resource: "https://mcp.needt.app/mcp",
        authorization_servers: ["https://use.needt.app"],
        scopes_supported: ["needt.read", "needt.write", "mail.read"],
        bearer_methods_supported: ["header"],
        resource_name: "Needt",
        resource_documentation: "https://use.needt.app/docs/connector-api",
      });
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    }
  });

  it("has no document for other paths", async () => {
    expect((await metadata(["api", "mcp"])).status).toBe(404);
    expect((await metadata(["other"])).status).toBe(404);
  });

  it("answers CORS preflight", async () => {
    expect((await metadataOptions()).status).toBe(204);
  });
});

describe("middleware on the MCP host", () => {
  it("rewrites /mcp to the MCP route", async () => {
    const response = await at("https://mcp.needt.app/mcp");
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://mcp.needt.app/api/mcp"
    );
  });

  it("uses the forwarded host behind the proxy", async () => {
    const response = await at("http://needt:3000/mcp", {
      "x-forwarded-host": "mcp.needt.app",
    });
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://needt:3000/api/mcp"
    );
  });

  it("cannot be escaped with a client-supplied X-Forwarded-Host", async () => {
    const response = await at("https://mcp.needt.app/auth/signin", {
      host: "mcp.needt.app",
      "x-forwarded-host": "use.needt.app",
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
  });

  it("lets the metadata through", async () => {
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ]) {
      const response = await at(`https://mcp.needt.app${path}`);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("serves nothing else: no app, no sign-in redirect", async () => {
    for (const path of [
      "/",
      "/today",
      "/api/mcp",
      "/auth/signin",
      "/api/tasks",
    ]) {
      const response = await at(`https://mcp.needt.app${path}`);
      expect(response.status).toBe(404);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("leaves the app host as it was, with the metadata public", async () => {
    const metadataOnApp = await at(
      "https://use.needt.app/.well-known/oauth-protected-resource/mcp"
    );
    expect(metadataOnApp.headers.get("x-middleware-next")).toBe("1");
    const page = await at("https://use.needt.app/today");
    expect(page.status).toBe(307);
  });
});
