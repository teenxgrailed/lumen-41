import { findMcpTool, listMcpTools } from "../tools";

const schemaOf = (name: string) =>
  listMcpTools().find((tool) => tool.name === name)!;
type Prop = Record<string, unknown>;
const props = (name: string) =>
  (schemaOf(name).inputSchema as { properties: Record<string, Prop> })
    .properties;

describe("MCP subtask tools", () => {
  it("needt_create_task accepts entry, subtasks, projectId and dependsOnId", () => {
    const p = props("needt_create_task");
    expect(Object.keys(p)).toEqual(
      expect.arrayContaining(["entry", "subtasks", "projectId", "dependsOnId"])
    );
    expect(p.subtasks).toMatchObject({
      type: "array",
      maxItems: 30,
      items: {
        anyOf: [
          { type: "string" },
          { type: "object", additionalProperties: false },
        ],
      },
    });
  });

  it("parses a task with its subtasks in one call", () => {
    const tool = findMcpTool("needt_create_task")!;
    const parsed = tool.input.safeParse({
      title: "Launch brief",
      entry: "Open the numbers",
      subtasks: ["Pull numbers", { title: "Draft" }],
      dependsOnId: "t0",
    });
    expect(parsed.success).toBe(true);
    expect(
      tool.input.safeParse({ title: "x", subtasks: [{ name: "no" }] }).success
    ).toBe(false);
    expect(
      tool.input.safeParse({
        title: "x",
        subtasks: Array.from({ length: 31 }, () => "s"),
      }).success
    ).toBe(false);
  });

  it("tells the model to split work: entry first, steps in order, task last", () => {
    for (const name of ["needt_create_task", "needt_add_subtasks"]) {
      const { description } = schemaOf(name);
      expect(description).toMatch(/Break any non-trivial task/);
      expect(description).toMatch(/entry/);
      expect(description).toMatch(/finished last/);
    }
    expect(schemaOf("needt_complete_subtask").description).toMatch(
      /allDone: true/
    );
  });

  it("needt_add_subtasks needs a task and at least one step", () => {
    const tool = findMcpTool("needt_add_subtasks")!;
    expect(tool.input.safeParse({ taskId: "t1", subtasks: [] }).success).toBe(
      false
    );
    expect(tool.input.safeParse({ subtasks: ["a"] }).success).toBe(false);
    expect(
      tool.input.safeParse({ taskId: "t1", subtasks: ["a", "b"] }).success
    ).toBe(true);
    expect(
      (schemaOf("needt_add_subtasks").inputSchema as { required: string[] })
        .required
    ).toEqual(["taskId", "subtasks"]);
  });

  it("needt_complete_subtask defaults done to true and is idempotent", () => {
    const tool = findMcpTool("needt_complete_subtask")!;
    expect(tool.annotations.idempotentHint).toBe(true);
    const parsed = tool.input.safeParse({ taskId: "t", subtaskId: "s" });
    expect(parsed.success && parsed.data).toMatchObject({ done: true });
  });

  it("needt_update_task can set the first step and the one blocker", () => {
    expect(Object.keys(props("needt_update_task"))).toEqual(
      expect.arrayContaining(["entry", "dependsOnId"])
    );
    const tool = findMcpTool("needt_update_task")!;
    expect(
      tool.input.safeParse({ id: "t", entry: null, dependsOnId: null }).success
    ).toBe(true);
  });

  it("both new tools write", () => {
    for (const name of ["needt_add_subtasks", "needt_complete_subtask"]) {
      expect(schemaOf(name).annotations?.readOnlyHint).toBe(false);
    }
  });
});
