import { NextRequest } from "next/server";

import { authorizeConnectorWorkspace } from "@/services/connectors/auth";
import type { BearerAuth } from "@/services/connectors/bearer";
import {
  appendLiveTableRows,
  createLiveTable,
  getLiveTable,
} from "@/services/live-tables/live-table-service";
import { PageCollaborationActiveError } from "@/services/pages/page-write-path";

import { publishRealtimeEventSafe } from "@/lib/realtime/publish";

import { zodToJsonSchema } from "../json-schema";
import { findMcpTool } from "../tools";

jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn(),
  publishRealtimeEventSafe: jest.fn(),
}));
jest.mock("@/services/connectors/auth", () => ({
  authorizeConnectorWorkspace: jest.fn(),
}));
jest.mock("@/services/live-tables/live-table-service", () => ({
  ...jest.requireActual("@/services/live-tables/live-table-service"),
  createLiveTable: jest.fn(),
  appendLiveTableRows: jest.fn(),
  getLiveTable: jest.fn(),
  updateLiveTableRow: jest.fn(),
}));

const ctx = {
  request: new NextRequest("https://use.needt.app/api/mcp", { method: "POST" }),
  userId: "u1",
  auth: { userId: "u1" } as unknown as BearerAuth,
};
const view = (rowIds: string[]) => ({
  id: "t1",
  pageId: "p1",
  title: "Mics",
  createdBy: "AI",
  createdAt: "2026-11-12T10:00:00.000Z",
  updatedAt: "2026-11-12T10:00:00.000Z",
  columns: [
    { id: "c1", name: "Model", type: "text" },
    { id: "c2", name: "Status", type: "select", options: ["Yes", "No"] },
  ],
  rows: rowIds.map((id, index) => ({
    id,
    position: (index + 1) * 1024,
    cells: { c1: id.toUpperCase(), c2: "Yes" },
  })),
});

function call(name: string, args: Record<string, unknown>) {
  const tool = findMcpTool(name)!;
  return tool.invoke(ctx, tool.input.parse(args));
}

const payload = (result: { content: { text: string }[] }) =>
  JSON.parse(result.content[0].text);

beforeEach(() => {
  jest.clearAllMocks();
  (authorizeConnectorWorkspace as jest.Mock).mockResolvedValue({
    workspace: { workspaceId: "w1", workspaceKind: "PERSONAL" },
  });
});

describe("live table MCP tools", () => {
  it.each([
    "needt_create_table",
    "needt_add_table_rows",
    "needt_update_table_row",
    "needt_get_table",
  ])("%s has a JSON input schema", (name) => {
    const tool = findMcpTool(name);
    expect(tool).toBeDefined();
    const schema = zodToJsonSchema(tool!.input);
    expect(schema.type).toBe("object");
    expect(JSON.stringify(schema)).not.toContain("undefined");
    // An unbounded z.number() must not become "maximum": null (clients refuse it).
    expect(JSON.stringify(schema)).not.toMatch(/"(minimum|maximum)":null/);
  });

  it("creates a table as the AI and tells the open app", async () => {
    (createLiveTable as jest.Mock).mockResolvedValue(view([]));
    const result = await call("needt_create_table", {
      title: "Mics",
      columns: [
        { name: "Model" },
        { name: "Status", type: "select", options: ["Yes", "No"] },
      ],
    });
    expect(result.isError).toBeUndefined();
    expect(payload(result)).toMatchObject({
      id: "t1",
      rowCount: 0,
      exportUrl: "/api/live-tables/t1/export",
    });
    expect((createLiveTable as jest.Mock).mock.calls[0][0]).toMatchObject({
      userId: "u1",
      ai: true,
    });
    expect((createLiveTable as jest.Mock).mock.calls[0][1].createdBy).toBe("AI");
    const types = (publishRealtimeEventSafe as jest.Mock).mock.calls.map(
      ([, type]) => type
    );
    expect(types).toEqual(["docs-updated", "tables-updated"]);
  });

  it("answers a page open for live editing with a 409 the model can act on", async () => {
    (createLiveTable as jest.Mock).mockRejectedValue(
      new PageCollaborationActiveError()
    );
    const result = await call("needt_create_table", {
      title: "Mics",
      pageId: "p1",
      columns: [{ name: "Model" }],
    });
    expect(result.isError).toBe(true);
    expect(payload(result)).toMatchObject({ status: 409 });
    expect(payload(result).error).toMatch(/leave pageId out/);
    expect(publishRealtimeEventSafe).not.toHaveBeenCalled();
  });

  it("appends rows and returns the new row ids", async () => {
    (getLiveTable as jest.Mock).mockResolvedValue(view(["r1"]));
    (appendLiveTableRows as jest.Mock).mockResolvedValue(view(["r1", "r2", "r3"]));
    const result = await call("needt_add_table_rows", {
      tableId: "t1",
      rows: [["B", "No"], { Model: "C" }],
    });
    expect(payload(result)).toMatchObject({
      rowCount: 3,
      addedRowIds: ["r2", "r3"],
    });
    expect(publishRealtimeEventSafe).toHaveBeenCalledWith("u1", "tables-updated");
  });

  it("reads rows back keyed by column name", async () => {
    (getLiveTable as jest.Mock).mockResolvedValue(view(["r1"]));
    const result = await call("needt_get_table", { id: "t1" });
    expect(payload(result).rows).toEqual([
      { id: "r1", cells: { Model: "R1", Status: "Yes" } },
    ]);
  });

  it("turns a bad dropdown value into a 400", async () => {
    const { LiveTableInputError } = jest.requireActual(
      "@/lib/live-tables/schema"
    );
    (getLiveTable as jest.Mock).mockResolvedValue(view([]));
    (appendLiveTableRows as jest.Mock).mockRejectedValue(
      new LiveTableInputError('"Maybe" is not one of the options')
    );
    const result = await call("needt_add_table_rows", {
      tableId: "t1",
      rows: [["A", "Maybe"]],
    });
    expect(result.isError).toBe(true);
    expect(payload(result)).toMatchObject({ status: 400 });
  });
});
