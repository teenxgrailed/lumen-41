/** @jest-environment node */
import { createSchedulerAI } from "../providers";
import type { AgentTurnEvent } from "../types";

function sse(frames: unknown[]) {
  const body = frames
    .map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
    .concat("data: [DONE]\n\n")
    .join("");
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

const choice = (delta: Record<string, unknown>) => ({ choices: [{ delta }] });

async function collect(gen: AsyncGenerator<AgentTurnEvent>) {
  const out: AgentTurnEvent[] = [];
  for await (const event of gen) out.push(event);
  return out;
}

describe("OpenAI-compatible streamTurn", () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
  });

  it("streams text, hides reasoning, and assembles split tool calls", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      sse([
        choice({ reasoning_content: "thinking about it" }),
        choice({ content: "Let me " }),
        choice({ content: "check." }),
        choice({
          tool_calls: [
            {
              index: 0,
              id: "call_1",
              function: { name: "list_tasks", arguments: '{"sta' },
            },
          ],
        }),
        choice({
          tool_calls: [{ index: 0, function: { arguments: 'tus":"open"}' } }],
        }),
        choice({
          tool_calls: [
            {
              index: 1,
              id: "call_2",
              function: { name: "list_habits", arguments: "{}" },
            },
          ],
        }),
      ])
    );
    global.fetch = fetchMock as never;
    const ai = createSchedulerAI({
      provider: "OPENAI",
      apiKey: "test-key",
      baseUrl: "https://llm.example.com/v1",
      model: "m",
    });

    const events = await collect(
      ai.streamTurn!({
        systemPrompt: "sys",
        messages: [
          { role: "user", content: "hi" },
          {
            role: "assistant",
            content: "",
            toolCalls: [{ id: "p", name: "x", arguments: "{}" }],
          },
          { role: "tool", toolCallId: "p", content: "{}" },
        ],
        tools: [{ name: "list_tasks", description: "d", parameters: {} }],
      })
    );

    expect(events).toEqual([
      { type: "text", value: "Let me " },
      { type: "text", value: "check." },
      {
        type: "tool_call",
        id: "call_1",
        name: "list_tasks",
        arguments: { status: "open" },
        rawArguments: '{"status":"open"}',
      },
      {
        type: "tool_call",
        id: "call_2",
        name: "list_habits",
        arguments: {},
        rawArguments: "{}",
      },
    ]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://llm.example.com/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.stream).toBe(true);
    expect(body.tool_choice).toBe("auto");
    expect(body.tool_stream).toBeUndefined();
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
    ]);
    expect(body.messages[2].tool_calls[0]).toEqual({
      id: "p",
      type: "function",
      function: { name: "x", arguments: "{}" },
    });
    expect(body.messages[3].tool_call_id).toBe("p");
    expect(JSON.stringify(init.headers)).not.toContain("sys");
  });

  it("asks Z.ai to stream tool arguments", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(sse([choice({ content: "k" })]));
    global.fetch = fetchMock as never;
    const ai = createSchedulerAI({
      provider: "OPENAI",
      apiKey: "test-key",
      baseUrl: "https://api.z.ai/api/paas/v4",
      model: "glm-5.3-flash",
    });
    await collect(
      ai.streamTurn!({
        systemPrompt: "s",
        messages: [{ role: "user", content: "hi" }],
        tools: [{ name: "t", description: "d", parameters: {} }],
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tool_stream).toBe(true);
    expect(body.model).toBe("glm-5.3-flash");
  });

  it("fails clearly without a key and never echoes it", async () => {
    const ai = createSchedulerAI({ provider: "OPENAI", apiKey: null });
    await expect(
      collect(ai.streamTurn!({ systemPrompt: "s", messages: [], tools: [] }))
    ).rejects.toThrow("API key is not configured");
  });
});
