import { z } from "zod";

import { ADMIN_READ_SCOPE } from "@/lib/mcp-config";

import { zodToJsonSchema } from "../json-schema";
import { listMcpTools } from "../tools";

/** Every key whose value would not survive JSON as the number it claims. */
function badNumberKeys(value: unknown, path = ""): string[] {
  if (!value || typeof value !== "object") return [];
  const out: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const here = `${path}/${key}`;
    if (
      ["minimum", "maximum", "minItems", "maxItems"].includes(key) &&
      (typeof child !== "number" || !Number.isFinite(child))
    ) {
      out.push(here);
    }
    out.push(...badNumberKeys(child, here));
  }
  return out;
}

describe("MCP input schemas", () => {
  it("drops the infinite bounds zod 4 reports for an unbounded number", () => {
    expect(zodToJsonSchema(z.number())).toEqual({ type: "number" });
    expect(zodToJsonSchema(z.number().int())).toEqual({ type: "integer" });
    expect(zodToJsonSchema(z.number().int().min(0).max(23))).toEqual({
      type: "integer",
      minimum: 0,
      maximum: 23,
    });
  });

  it("every tool's schema survives JSON with real numeric bounds", () => {
    const tools = listMcpTools(
      ["needt.read", "needt.write", ADMIN_READ_SCOPE],
      {
        hub: true,
        quit: true,
        dayPlan: true,
      }
    );
    const broken = tools.flatMap((tool) =>
      badNumberKeys(JSON.parse(JSON.stringify(tool.inputSchema))).map(
        (path) => `${tool.name}${path}`
      )
    );
    expect(broken).toEqual([]);
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["needt_create_goal", "needt_update_goal"])
    );
  });
});
