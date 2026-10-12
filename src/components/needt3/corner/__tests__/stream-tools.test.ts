import { AGENT_TOOL_CATALOG } from "@/services/ai/tool-catalog";

import { READ_ONLY_TOOLS, changedData } from "../stream";

describe("changedData", () => {
  it("does not refetch after a read-only tool", () => {
    for (const tool of READ_ONLY_TOOLS) {
      expect(changedData({ type: "meta", toolName: tool })).toBe(false);
    }
  });

  it("refetches after a tool that writes", () => {
    for (const tool of [
      "create_task",
      "edit_task",
      "delete_task",
      "remember",
    ]) {
      expect(changedData({ type: "meta", toolName: tool })).toBe(true);
    }
  });

  it("counts an unknown tool as a write and no tool as nothing", () => {
    expect(changedData({ type: "meta", toolName: "new_tool" })).toBe(true);
    expect(changedData({ type: "meta" })).toBe(false);
    expect(changedData({ type: "meta", toolName: null })).toBe(false);
  });

  it("names only tools the catalog has, none of them dangerous", () => {
    for (const tool of READ_ONLY_TOOLS) {
      expect(AGENT_TOOL_CATALOG[tool]).toBeDefined();
      expect(AGENT_TOOL_CATALOG[tool].dangerous).toBeFalsy();
    }
  });
});
