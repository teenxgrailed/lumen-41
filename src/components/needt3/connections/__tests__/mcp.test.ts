import {
  AI_TOOL_IDS,
  aiSub,
  appsFor,
  maskToken,
  oauthUrlFromEnv,
  richParts,
  stepData,
  tokenUrl,
  toolAvailable,
} from "../mcp";

const o = { url: "https://use.needt.app/api/mcp", oauthUrl: null, token: null };

describe("mcp rules", () => {
  it("hides the OAuth host unless the env names an https URL", () => {
    expect(oauthUrlFromEnv(undefined)).toBeNull();
    expect(oauthUrlFromEnv("http://x")).toBeNull();
    expect(oauthUrlFromEnv(" https://mcp.needt.app/mcp ")).toBe(
      "https://mcp.needt.app/mcp"
    );
    expect(toolAvailable("claude", null)).toBe(false);
    expect(toolAvailable("claude", "https://mcp.needt.app/mcp")).toBe(true);
    expect(toolAvailable("cursor", null)).toBe(true);
  });
  it("builds the token URL from the origin", () => {
    expect(tokenUrl("https://use.needt.app/")).toBe(
      "https://use.needt.app/api/mcp"
    );
  });
  it("gives every tool steps; header tools start with the token", () => {
    for (const id of AI_TOOL_IDS)
      expect(stepData(id, o).length).toBeGreaterThan(2);
    expect(stepData("cursor", o)[0].x).toBe("token");
    expect(stepData("claude", o).some((s) => s.x === "url")).toBe(true);
  });
  it("masks the token on screen but copies it whole", () => {
    const steps = stepData("othermcp", {
      ...o,
      token: "needt_abcdefghijklmnop",
    });
    const cmd = steps.find(
      (s) => typeof s.x === "object" && s.x?.code.startsWith("claude mcp add")
    )?.x as { code: string; copy: string };
    expect(cmd.code).toContain(maskToken("needt_abcdefghijklmnop"));
    expect(cmd.copy).toContain('Bearer needt_abcdefghijklmnop"');
  });
  it("parses bold and path marks", () => {
    expect(richParts("Open **A** at `~/x`").map((p) => p.kind)).toEqual([
      "text",
      "b",
      "text",
      "path",
    ]);
  });
  it("matches connected apps to tools by name", () => {
    const apps = [{ clientName: "Claude Code" }, { clientName: "ChatGPT" }];
    expect(appsFor("claude", apps)).toHaveLength(1);
    expect(appsFor("othermcp", apps)).toHaveLength(0);
    expect(aiSub(0)).toBe("No AI tools connected yet");
    expect(aiSub(2)).toBe("2 connected apps");
  });
});
