import { assembleAgentSystemPrompt } from "../system-prompt";
import { AGENT_TOOL_CATALOG, validateAgentToolCall } from "../tool-catalog";

describe("Ask Needt subtask tools", () => {
  it("create_task takes entry, ordered subtasks, a project and a blocker", () => {
    const args = {
      title: "Ship the launch brief",
      entry: "Open last month's numbers",
      subtasks: ["Pull numbers", { title: "Draft", done: false }, "Review"],
      projectId: "p1",
      dependsOnId: "t0",
    };
    expect(validateAgentToolCall("create_task", args)).toEqual(args);
  });

  it("create_task rejects an empty step, too many steps and unknown keys", () => {
    expect(
      validateAgentToolCall("create_task", { title: "x", subtasks: [""] })
    ).toBeNull();
    expect(
      validateAgentToolCall("create_task", {
        title: "x",
        subtasks: Array.from({ length: 31 }, (_, i) => `step ${i}`),
      })
    ).toBeNull();
    expect(
      validateAgentToolCall("create_task", { title: "x", parentId: "t1" })
    ).toBeNull();
  });

  it("describes the entry-first, closing-last flow to the model", () => {
    for (const name of ["create_task", "add_subtasks"]) {
      const { description } = AGENT_TOOL_CATALOG[name].definition;
      expect(description).toMatch(/entry/);
      expect(description).toMatch(/closing step/);
      expect(description).toMatch(/order/);
    }
    const params = AGENT_TOOL_CATALOG.create_task.definition.parameters as {
      properties: Record<string, { type: string; items?: { type: string } }>;
      required: string[];
    };
    expect(params.properties.subtasks).toMatchObject({
      type: "array",
      items: { type: "string" },
    });
    expect(params.properties.entry.type).toBe("string");
    expect(params.properties.dependsOnId.type).toBe("string");
    expect(params.required).toEqual(["title"]);
  });

  it("add_subtasks needs at least one step; complete_subtask defaults to done", () => {
    expect(
      validateAgentToolCall("add_subtasks", { taskId: "t1", subtasks: [] })
    ).toBeNull();
    expect(
      validateAgentToolCall("add_subtasks", { taskId: "t1", subtasks: ["a"] })
    ).toEqual({ taskId: "t1", subtasks: ["a"] });
    expect(
      validateAgentToolCall("complete_subtask", {
        taskId: "t1",
        subtaskTitle: "Draft",
      })
    ).toEqual({ taskId: "t1", subtaskTitle: "Draft", done: true });
  });

  it("neither new tool needs confirmation", () => {
    expect(AGENT_TOOL_CATALOG.add_subtasks.dangerous).toBeFalsy();
    expect(AGENT_TOOL_CATALOG.complete_subtask.dangerous).toBeFalsy();
  });

  it("puts the subtask guidance in the system prompt", () => {
    const { prompt } = assembleAgentSystemPrompt({
      soulPreset: "business",
      memories: [],
      scheduleSummary: "",
    });
    expect(prompt).toMatch(/subtasks/);
    expect(prompt).toMatch(/complete_subtask/);
    expect(prompt).toMatch(/closing step/);
  });
});
