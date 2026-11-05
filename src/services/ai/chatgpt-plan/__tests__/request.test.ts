import {
  UNSUPPORTED_RESPONSES_FIELDS,
  buildChatGptPlanRequest,
  stripUnsupportedFields,
} from "../request";

describe("ChatGPT plan request", () => {
  const turn = {
    systemPrompt: "You are Needt.",
    messages: [
      { role: "user" as const, content: "hi" },
      {
        role: "assistant" as const,
        content: "",
        toolCalls: [{ id: "call_1", name: "list_tasks", arguments: "{}" }],
      },
      { role: "tool" as const, toolCallId: "call_1", content: "[]" },
    ],
    tools: [
      {
        name: "list_tasks",
        description: "List tasks",
        parameters: { type: "object", properties: {} },
      },
    ],
  };

  it("is stored:false, streamed, with instructions and no system item", () => {
    const body = buildChatGptPlanRequest({ model: "m", turn });
    expect(body).toMatchObject({
      model: "m",
      instructions: "You are Needt.",
      store: false,
      stream: true,
    });
    expect(body.input.some((i) => i.role === "system")).toBe(false);
  });

  it("sends none of the rejected fields", () => {
    const body = buildChatGptPlanRequest({ model: "m", turn });
    for (const field of UNSUPPORTED_RESPONSES_FIELDS) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it("strips rejected fields added by anyone", () => {
    const dirty = {
      model: "m",
      temperature: 0.2,
      max_output_tokens: 600,
      user: "u",
      previous_response_id: "r",
      store: false,
    };
    expect(stripUnsupportedFields(dirty)).toEqual({ model: "m", store: false });
  });

  it("echoes tool calls and results as items, tools in one namespace", () => {
    const body = buildChatGptPlanRequest({ model: "m", turn });
    expect(body.input).toEqual([
      { role: "user", content: "hi" },
      expect.objectContaining({
        type: "function_call",
        call_id: "call_1",
        name: "list_tasks",
        namespace: "needt",
      }),
      { type: "function_call_output", call_id: "call_1", output: "[]" },
    ]);
    expect(body.tools).toHaveLength(1);
    expect(body.tools?.[0]).toMatchObject({ type: "namespace", name: "needt" });
  });

  it("omits tools when there are none", () => {
    const body = buildChatGptPlanRequest({
      model: "m",
      turn: { ...turn, tools: [] },
    });
    expect(body).not.toHaveProperty("tools");
  });
});
