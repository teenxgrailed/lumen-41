import type { AiProviderReport } from "../../provider-choice";
import type { SchedulerAI } from "../../types";
import { classifyResponsesError } from "../errors";
import { getChatGptPlanAccessToken } from "../oauth";
import { ChatGptPlanProvider } from "../provider";

jest.mock("../oauth", () => ({ getChatGptPlanAccessToken: jest.fn() }));
jest.mock("@/lib/feature-flags", () => ({ chatGptPlanFlagEnabled: jest.fn() }));

const token = getChatGptPlanAccessToken as jest.Mock;
const turn = { systemPrompt: "s", messages: [], tools: [] };

function sse(events: unknown[], status = 200) {
  const body = events
    .map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`)
    .join("");
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
const completed = { type: "response.completed", response: {} };

function setup(
  fallback: () => Promise<{ ai: SchedulerAI; charged: boolean } | null>
) {
  const report: AiProviderReport = {
    requested: "chatgpt_plan",
    used: "chatgpt_plan",
    fallback: null,
  };
  const ai = new ChatGptPlanProvider({
    userId: "u1",
    config: { clientId: "c", model: "m" },
    report,
    fallback,
  });
  return { ai, report };
}
async function drain(gen: AsyncGenerator<unknown>) {
  const out: unknown[] = [];
  for await (const e of gen) out.push(e);
  return out;
}
const hosted = (text: string, charged: boolean) => ({
  charged,
  ai: {
    name: "hosted",
    streamTurn: async function* () {
      yield { type: "text" as const, value: text };
    },
  } as unknown as SchedulerAI,
});

beforeEach(() => {
  jest.clearAllMocks();
  token.mockResolvedValue({ ok: true, accessToken: "tok", expiresAt: null });
});

describe("ChatGPT plan provider", () => {
  it("streams text and tool calls from the Responses events", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      sse([
        { type: "response.output_text.delta", delta: "Hi" },
        {
          type: "response.output_item.added",
          output_index: 1,
          item: { type: "function_call", call_id: "c1", name: "list_tasks" },
        },
        {
          type: "response.function_call_arguments.delta",
          output_index: 1,
          delta: '{"a":',
        },
        {
          type: "response.function_call_arguments.done",
          output_index: 1,
          arguments: '{"a":1}',
        },
        completed,
      ])
    );
    const { ai, report } = setup(async () => null);
    expect(await drain(ai.streamTurn!(turn))).toEqual([
      { type: "text", value: "Hi" },
      {
        type: "tool_call",
        id: "c1",
        name: "list_tasks",
        arguments: { a: 1 },
        rawArguments: '{"a":1}',
      },
    ]);
    expect(report.used).toBe("chatgpt_plan");
    const sent = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sent).toMatchObject({ store: false, stream: true });
    expect(sent).not.toHaveProperty("temperature");
  });

  it("falls back before the first event and reports it charged", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        json(
          { error: { code: "subscription_sharing_usage_limit_exceeded" } },
          429
        )
      );
    const { ai, report } = setup(async () => hosted("from needt", true));
    expect(await drain(ai.streamTurn!(turn))).toEqual([
      { type: "text", value: "from needt" },
    ]);
    expect(report.used).toBe("needt");
    expect(report.fallback).toEqual({ reason: "limit", charged: true });
  });

  it("reports not charged when the person's own key answers", async () => {
    global.fetch = jest.fn().mockResolvedValue(json({ detail: "x" }, 503));
    const { ai, report } = setup(async () => hosted("own key", false));
    await drain(ai.streamTurn!(turn));
    expect(report.fallback).toEqual({ reason: "unavailable", charged: false });
  });

  it("ends in plan_limit_reached when there is nothing to fall back on", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        json(
          { error: { code: "subscription_sharing_usage_limit_exceeded" } },
          429
        )
      );
    const { ai, report } = setup(async () => null);
    await expect(drain(ai.streamTurn!(turn))).rejects.toMatchObject({
      kind: "limit",
    });
    expect(report.used).toBe("none");
    expect(report.state).toBe("plan_limit_reached");
    expect(report.fallback).toBeNull();
  });

  it("does not fall back after text was yielded (mid-stream limit)", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      sse([
        { type: "response.output_text.delta", delta: "Part" },
        {
          type: "response.failed",
          response: {
            error: { code: "subscription_sharing_usage_limit_exceeded" },
          },
        },
      ])
    );
    const fallback = jest.fn(async () => hosted("x", true));
    const { ai, report } = setup(fallback);
    const seen: unknown[] = [];
    await expect(
      (async () => {
        for await (const e of ai.streamTurn!(turn)) seen.push(e);
      })()
    ).rejects.toMatchObject({ kind: "limit" });
    expect(seen).toEqual([{ type: "text", value: "Part" }]);
    expect(fallback).not.toHaveBeenCalled();
    expect(report.state).toBe("plan_limit_reached");
    expect(report.fallback).toBeNull();
  });

  it("does not fall back when a later step hits the limit after step one streamed", async () => {
    // The agent loop calls streamTurn once per step on the same provider.
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        sse([
          { type: "response.output_text.delta", delta: "Step one" },
          completed,
        ])
      )
      .mockResolvedValueOnce(
        json(
          { error: { code: "subscription_sharing_usage_limit_exceeded" } },
          429
        )
      );
    const fallback = jest.fn(async () => hosted("restart", true));
    const { ai, report } = setup(fallback);

    expect(await drain(ai.streamTurn!(turn))).toEqual([
      { type: "text", value: "Step one" },
    ]);
    await expect(drain(ai.streamTurn!(turn))).rejects.toMatchObject({
      kind: "limit",
    });
    expect(fallback).not.toHaveBeenCalled();
    expect(report.state).toBe("plan_limit_reached");
    expect(report.fallback).toBeNull();
    expect(report.used).toBe("none");
  });

  it("still falls back when the very first step fails and nothing was shown", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        json(
          { error: { code: "subscription_sharing_usage_limit_exceeded" } },
          429
        )
      );
    const { ai, report } = setup(async () => hosted("from needt", true));
    await drain(ai.streamTurn!(turn));
    expect(report.used).toBe("needt");
  });

  it("reads the model from models[].slug with visibility list", async () => {
    // Shape per the devkit (packages/local/src/models.ts), checked 2026-11-05.
    global.fetch = jest.fn().mockImplementation(async (url: string) =>
      String(url).endsWith("/models")
        ? json(
            {
              models: [
                { slug: "hidden", display_name: "H", visibility: "hide" },
                { slug: "gpt-x", display_name: "X", visibility: "list" },
              ],
            },
            200
          )
        : sse([completed])
    );
    const report: AiProviderReport = {
      requested: "chatgpt_plan",
      used: "chatgpt_plan",
      fallback: null,
    };
    const ai = new ChatGptPlanProvider({
      userId: "model-user",
      config: { clientId: "c" },
      report,
    });
    await drain(ai.streamTurn!(turn));
    const call = (global.fetch as jest.Mock).mock.calls.find(([u]) =>
      String(u).endsWith("/responses")
    );
    expect(JSON.parse(call[1].body).model).toBe("gpt-x");
  });

  it("falls back when the connection was revoked", async () => {
    token.mockResolvedValue({ ok: false, reason: "revoked" });
    global.fetch = jest.fn();
    const { ai, report } = setup(async () => hosted("n", true));
    await drain(ai.streamTurn!(turn));
    expect(report.fallback?.reason).toBe("revoked");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("retries once after a 401 with a forced refresh", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(json({ detail: "no" }, 401))
      .mockResolvedValueOnce(sse([completed]));
    const { ai } = setup(async () => null);
    await drain(ai.streamTurn!(turn));
    expect(token).toHaveBeenLastCalledWith("u1", { force: true });
  });

  it("does not fall back on an unsupported-capability error", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      json(
        {
          error: {
            code: "subscription_sharing_unsupported_capability",
            param: "tools",
          },
        },
        400
      )
    );
    const fallback = jest.fn(async () => hosted("x", true));
    const { ai } = setup(fallback);
    await expect(drain(ai.streamTurn!(turn))).rejects.toMatchObject({
      kind: "unsupported",
    });
    expect(fallback).not.toHaveBeenCalled();
  });
});

describe("error classification", () => {
  it.each([
    [429, "subscription_sharing_usage_limit_exceeded", "limit"],
    [403, "subscription_sharing_user_not_eligible", "ineligible"],
    [503, "subscription_sharing_usage_unavailable", "unavailable"],
    [400, "subscription_sharing_unsupported_capability", "unsupported"],
    [401, "subscription_sharing_invalid_user", "auth"],
  ])("%s %s is %s", (status, code, kind) => {
    expect(classifyResponsesError({ error: { code } }, status).kind).toBe(kind);
  });
  it("reads the {detail} body of an admission failure", () => {
    expect(classifyResponsesError({ detail: "region" }, 403).kind).toBe(
      "ineligible"
    );
  });
});
