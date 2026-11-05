import { prisma } from "@/lib/prisma";

import { agentChatResponse } from "../agent/chat-turn";
import { runAgentTurn } from "../agent/loop";
import { ChatGptPlanError } from "../chatgpt-plan/errors";
import type { AiProviderReport } from "../provider-choice";
import type { SchedulerAI } from "../types";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    aiMessage: { create: jest.fn(), updateMany: jest.fn() },
    aiConversation: { updateMany: jest.fn() },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../agent/loop", () => ({
  runAgentTurn: jest.fn(),
  runConfirmedToolCall: jest.fn(),
}));

const run = runAgentTurn as jest.Mock;
const create = prisma.aiMessage.create as jest.Mock;

function result(over: Record<string, unknown> = {}) {
  return {
    text: "",
    actions: [],
    sources: [],
    runId: "run-1",
    pending: null,
    changed: false,
    taskId: null,
    writeLimitReached: false,
    providerStop: null,
    ...over,
  };
}

async function respond(report: AiProviderReport) {
  const response = agentChatResponse({
    ai: { name: "x" } as SchedulerAI,
    settings: { allowParseTasks: true, allowFullAuto: false },
    conversationId: "conv",
    userId: "u1",
    workspace: { workspaceId: "w1" } as never,
    pageActor: "u1" as never,
    history: [],
    systemPrompt: "s",
    confirmedTool: null,
    confirmationMessageId: null,
    providerReport: report,
  });
  const lines = (await response.text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  return lines as Array<Record<string, unknown>>;
}

const limitReport = (): AiProviderReport => ({
  requested: "chatgpt_plan",
  used: "none",
  fallback: null,
  state: "plan_limit_reached",
});

beforeEach(() => jest.clearAllMocks());

describe("agent chat when the ChatGPT plan stops mid-turn", () => {
  it("keeps the partial answer, appends the limit note, and reports the real actions", async () => {
    const actions = [{ label: "Created task", undoable: true }];
    run.mockResolvedValue(
      result({
        text: "Part of the answer.",
        actions,
        changed: true,
        providerStop: new ChatGptPlanError("limit", "x"),
      })
    );
    const lines = await respond(limitReport());

    const tokens = lines.filter((l) => l.type === "token");
    expect(tokens).toHaveLength(1);
    expect(String(tokens[0].value)).toMatch(/^\n\nYour ChatGPT plan limit/);

    const done = lines.find((l) => l.type === "done")!;
    expect(done.actions).toEqual(actions);
    expect(done.changed).toBe(true);
    expect(done.runId).toBe("run-1");

    const saved = create.mock.calls[0][0].data;
    expect(saved.content).toMatch(
      /^Part of the answer\.\n\nYour ChatGPT plan limit is reached/
    );
    expect(saved.toolPayload).toMatchObject({ actions });
  });

  it("says why when the plan stopped before anything was said", async () => {
    run.mockResolvedValue(
      result({ providerStop: new ChatGptPlanError("limit", "x") })
    );
    const lines = await respond(limitReport());
    const token = lines.find((l) => l.type === "token")!;
    expect(String(token.value)).toMatch(/^Your ChatGPT plan limit/);
    expect(create.mock.calls[0][0].data.content).toBe(token.value);
  });

  it("uses the reconnect note when the connection needs renewing", async () => {
    run.mockResolvedValue(
      result({
        text: "Hi.",
        providerStop: new ChatGptPlanError("revoked", "x"),
      })
    );
    await respond({
      requested: "chatgpt_plan",
      used: "none",
      fallback: null,
      state: "reconnect_required",
    });
    expect(create.mock.calls[0][0].data.content).toMatch(
      /^Hi\.\n\nYour ChatGPT connection needs to be renewed/
    );
  });
});
