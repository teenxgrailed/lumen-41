import { GET } from "@/app/.well-known/mcp/server-card.json/route";
import { ADMIN_TOOLS } from "@/services/connectors/mcp/admin-tools";
import { mcpServerCard } from "@/services/connectors/mcp/server-card";
import { MCP_TOOLS } from "@/services/connectors/mcp/tools";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("MCP tool annotations (directory review)", () => {
  it("registers admin tools in the same registry", () => {
    for (const admin of ADMIN_TOOLS) {
      expect(MCP_TOOLS.map((t) => t.name)).toContain(admin.name);
    }
  });

  it.each(MCP_TOOLS.map((tool) => [tool.name, tool] as const))(
    "%s has a title and a read or destructive hint",
    (_name, tool) => {
      const a = tool.annotations;
      expect(typeof a.title).toBe("string");
      expect(a.title.trim().length).toBeGreaterThan(0);
      expect(a.openWorldHint).toBe(false);
      expect(
        typeof a.readOnlyHint === "boolean" ||
          typeof a.destructiveHint === "boolean"
      ).toBe(true);
      if (a.readOnlyHint) expect(a.destructiveHint).toBe(false);
    }
  );

  it("marks deleting tools destructive", () => {
    for (const tool of MCP_TOOLS) {
      if (/forget|remove|delete/.test(tool.name)) {
        expect(tool.annotations.destructiveHint).toBe(true);
      }
    }
  });
});

describe("MCP server card", () => {
  it("is served publicly and cacheable, generated from the registry", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("public");
    const card = await res.json();
    expect(card.name).toBe("Needt");
    expect(card.transport.type).toBe("streamable-http");
    expect(card.endpoint).toBe("https://mcp.needt.app/mcp");
    expect(card.authentication.type).toBe("oauth2");
    expect(card.authentication.resource_metadata).toBe(
      "https://mcp.needt.app/.well-known/oauth-protected-resource/mcp"
    );
    const publicTools = MCP_TOOLS.filter(
      (t) => !ADMIN_TOOLS.some((a) => a.name === t.name)
    );
    expect(card.tools.map((t: { name: string }) => t.name)).toEqual(
      publicTools.map((t) => t.name)
    );
    for (const t of card.tools) {
      expect(t.title).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.annotations.title).toBe(t.title);
    }
    expect(mcpServerCard().tools.length).toBe(publicTools.length);
  });
});
