import { HUB_TOOLS, isHubTool } from "@/services/connectors/mcp/hub-tools";
import {
  MCP_TOOLS,
  isWriteCall,
  listMcpTools,
  requiredScopes,
} from "@/services/connectors/mcp/tools";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const find = (name: string) => {
  const tool = MCP_TOOLS.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`${name} is not registered`);
  return tool;
};

describe("hub attachment tools", () => {
  it("registers both tools as hub tools", () => {
    for (const name of ["needt_agent_attach", "needt_agent_files"]) {
      expect(HUB_TOOLS.map((tool) => tool.name)).toContain(name);
      expect(isHubTool(find(name))).toBe(true);
    }
  });

  it("is a write for attach and a read for files", () => {
    expect(isWriteCall(find("needt_agent_attach"), {})).toBe(true);
    expect(isWriteCall(find("needt_agent_files"), {})).toBe(false);
    expect(find("needt_agent_attach").annotations.readOnlyHint).toBe(false);
    expect(find("needt_agent_files").annotations.readOnlyHint).toBe(true);
  });

  it("needs agents.hub on an agent token, the ordinary scope otherwise", () => {
    const agent = { scopes: ["agents.hub"] } as never;
    const personal = { scopes: ["needt.read", "needt.write"] } as never;
    expect(requiredScopes(find("needt_agent_attach"), {}, agent)).toEqual([
      "agents.hub",
    ]);
    expect(requiredScopes(find("needt_agent_files"), {}, agent)).toEqual([
      "agents.hub",
    ]);
    expect(requiredScopes(find("needt_agent_attach"), {}, personal)).toEqual([
      "needt.write",
    ]);
    expect(requiredScopes(find("needt_agent_files"), {}, personal)).toEqual([
      "needt.read",
    ]);
  });

  it("lists them only when the hub is on for the account", () => {
    const names = (hub: boolean) =>
      listMcpTools([], { hub }).map((tool) => tool.name);
    expect(names(false)).not.toContain("needt_agent_attach");
    expect(names(true)).toEqual(
      expect.arrayContaining(["needt_agent_attach", "needt_agent_files"])
    );
  });

  it("takes itemId and name, with the file optional", () => {
    const schema = listMcpTools([], { hub: true }).find(
      (tool) => tool.name === "needt_agent_attach"
    )?.inputSchema as {
      required?: string[];
      properties: Record<string, unknown>;
    };
    expect(schema.required).toEqual(expect.arrayContaining(["itemId", "name"]));
    expect(schema.required).not.toContain("contentBase64");
    expect(schema.properties).toHaveProperty("contentBase64");
  });
});
