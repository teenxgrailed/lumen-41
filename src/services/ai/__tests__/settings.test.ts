import { prisma } from "@/lib/prisma";

import { chatGptPlanAvailable } from "../chatgpt-plan/config";
import { getChatGptPlanAccessToken } from "../chatgpt-plan/oauth";
import { ChatGptPlanProvider } from "../chatgpt-plan/provider";
import { createSchedulerAI } from "../providers";
import {
  getConfiguredSchedulerAI,
  getPreparedSchedulerAI,
  slowHostedConfig,
} from "../settings";
import { waitForHostedAiSlot } from "../slow-queue";
import {
  claimHostedAiAction,
  getHostedAiUsage,
  releaseHostedAiAction,
  resolveAiAccessMode,
} from "../usage";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    aISettings: { upsert: jest.fn() },
  },
}));
jest.mock("../encryption", () => ({
  decryptSecret: jest.fn((value: string | null) =>
    value ? "decrypted-user-key" : null
  ),
}));
jest.mock("../oauth", () => ({
  getCustomAIOAuthAccessToken: jest.fn(),
  getCustomAIOAuthConfig: jest.fn(),
}));
jest.mock("../chatgpt-plan/config", () => ({
  CHATGPT_PLAN_MANAGE_USAGE_URL: "https://chatgpt.example/usage",
  chatGptPlanAvailable: jest.fn(),
}));
jest.mock("../chatgpt-plan/oauth", () => ({
  getChatGptPlanAccessToken: jest.fn(),
}));
jest.mock("../chatgpt-plan/provider", () => ({
  ChatGptPlanProvider: jest.fn().mockImplementation((options) => ({ options })),
}));
jest.mock("../providers", () => ({
  createSchedulerAI: jest.fn((config) => ({ config })),
}));
jest.mock("../slow-queue", () => ({
  waitForHostedAiSlot: jest.fn(),
}));
jest.mock("../usage", () => ({
  HOSTED_AI_CONFIG: {
    baseUrl: "https://hosted.example/v1",
    model: "hosted-model",
  },
  getHostedAiUsage: jest.fn(),
  hostedAiRoutingBody: jest.fn(() => ({
    provider: { data_collection: "deny" },
  })),
  publicHostedAiUsage: jest.fn((status) => status),
  claimHostedAiAction: jest.fn(),
  releaseHostedAiAction: jest.fn(),
  resolveAiAccessMode: jest.fn((input) => {
    if (input.hasByok) return "byok";
    if (input.hostedAvailable && input.hostedAllowed) return "hosted";
    return "none";
  }),
}));

const baseSettings = {
  userId: "user-1",
  provider: "NONE",
  encryptedAnthropicKey: null,
  encryptedOpenAIKey: null,
  encryptedGrokKey: null,
  encryptedGlmKey: null,
  encryptedApiKey: null,
  customUrl: null,
  model: null,
  soulPreset: "business",
  allowParseTasks: true,
  allowReorder: false,
  allowSuggestEnergy: true,
  allowFullAuto: false,
  requestTimeoutSeconds: 20,
};

describe("prepared scheduler AI", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEEDT_AI_API_KEY = "hosted-key";
    jest
      .mocked(prisma.aISettings.upsert)
      .mockResolvedValue(baseSettings as never);
    jest.mocked(waitForHostedAiSlot).mockResolvedValue(undefined);
    jest.mocked(releaseHostedAiAction).mockResolvedValue(undefined);
  });

  it("queues and caps only a claimed hosted slow-mode action", async () => {
    jest.mocked(getHostedAiUsage).mockResolvedValue({
      plan: "PRO",
      allowed: true,
      mode: "slow",
    } as never);
    jest.mocked(claimHostedAiAction).mockResolvedValue({
      claimed: true,
      mode: "slow",
      usage: { plan: "PRO", allowed: true, mode: "slow" },
    } as never);

    const result = await getPreparedSchedulerAI("user-1");

    expect(result.hostedMode).toBe("slow");
    expect(waitForHostedAiSlot).toHaveBeenCalledWith("user-1");
    expect(createSchedulerAI).toHaveBeenLastCalledWith(
      expect.objectContaining({
        apiKey: "hosted-key",
        maxTokens: 600,
      })
    );
  });

  it("never claims, queues, or caps a BYOK action", async () => {
    jest.mocked(prisma.aISettings.upsert).mockResolvedValue({
      ...baseSettings,
      provider: "OPENAI",
      encryptedOpenAIKey: "encrypted-user-key",
    } as never);
    jest.mocked(getHostedAiUsage).mockResolvedValue({
      plan: "PRO",
      allowed: false,
      mode: "blocked",
    } as never);

    const result = await getPreparedSchedulerAI("user-1");

    expect(result.source).toBe("byok");
    expect(result.hostedMode).toBeNull();
    expect(resolveAiAccessMode).toHaveBeenCalledWith(
      expect.objectContaining({ hasByok: true })
    );
    expect(claimHostedAiAction).not.toHaveBeenCalled();
    expect(waitForHostedAiSlot).not.toHaveBeenCalled();
    expect(createSchedulerAI).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ maxTokens: expect.anything() })
    );
  });

  it("releases a crossing-boundary claim when Redis cannot queue it", async () => {
    jest.mocked(getHostedAiUsage).mockResolvedValue({
      plan: "PRO",
      allowed: true,
      mode: "normal",
      slowMode: false,
    } as never);
    jest.mocked(claimHostedAiAction).mockResolvedValue({
      claimed: true,
      mode: "slow",
      yearMonth: "2026-09",
      usage: { plan: "PRO", allowed: true, mode: "slow" },
    } as never);
    jest
      .mocked(waitForHostedAiSlot)
      .mockRejectedValue(new Error("redis unavailable"));

    await expect(getPreparedSchedulerAI("user-1")).rejects.toThrow(
      "redis unavailable"
    );
    expect(releaseHostedAiAction).toHaveBeenCalledWith("user-1", "2026-09");
  });

  it("does not claim when an already-slow request cannot reserve a slot", async () => {
    jest.mocked(getHostedAiUsage).mockResolvedValue({
      plan: "PRO",
      allowed: true,
      mode: "slow",
      slowMode: true,
    } as never);
    jest
      .mocked(waitForHostedAiSlot)
      .mockRejectedValue(new Error("redis unavailable"));

    await expect(getPreparedSchedulerAI("user-1")).rejects.toThrow(
      "redis unavailable"
    );
    expect(claimHostedAiAction).not.toHaveBeenCalled();
    expect(releaseHostedAiAction).not.toHaveBeenCalled();
  });
});

describe("ChatGPT plan fallback and the default path", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEEDT_AI_API_KEY = "hosted-key";
    jest
      .mocked(prisma.aISettings.upsert)
      .mockResolvedValue(baseSettings as never);
    jest.mocked(waitForHostedAiSlot).mockResolvedValue(undefined);
    jest.mocked(getHostedAiUsage).mockResolvedValue({
      plan: "PRO",
      allowed: true,
      mode: "normal",
      slowMode: false,
    } as never);
    jest
      .mocked(chatGptPlanAvailable)
      .mockResolvedValue({ clientId: "client" } as never);
    jest
      .mocked(getChatGptPlanAccessToken)
      .mockResolvedValue({ ok: true, accessToken: "t", expiresAt: null });
  });

  function fallbackOf() {
    const options = jest.mocked(ChatGptPlanProvider).mock.calls[0][0];
    return options.fallback!;
  }

  it("caps the hosted fallback answer in slow mode", async () => {
    await getConfiguredSchedulerAI("user-1", { provider: "chatgpt_plan" });
    jest.mocked(claimHostedAiAction).mockResolvedValue({
      claimed: true,
      mode: "slow",
      yearMonth: "2026-11",
    } as never);

    const fallback = await fallbackOf()();

    expect(fallback?.charged).toBe(true);
    expect(waitForHostedAiSlot).toHaveBeenCalledWith("user-1");
    expect(createSchedulerAI).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiKey: "hosted-key", maxTokens: 600 })
    );
  });

  it("does not cap the hosted fallback answer in normal mode", async () => {
    await getConfiguredSchedulerAI("user-1", { provider: "chatgpt_plan" });
    jest.mocked(claimHostedAiAction).mockResolvedValue({
      claimed: true,
      mode: "normal",
      yearMonth: "2026-11",
    } as never);

    await fallbackOf()();

    expect(waitForHostedAiSlot).not.toHaveBeenCalled();
    expect(createSchedulerAI).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ maxTokens: expect.anything() })
    );
  });

  it("builds the slow config in one place", () => {
    expect(
      slowHostedConfig({ requestTimeoutSeconds: 20, soulPreset: "coach" })
    ).toMatchObject({
      provider: "OPENAI",
      maxTokens: 600,
      timeoutMs: 20_000,
      soulPreset: "coach",
    });
  });

  it.each([[undefined], [{}], [{ provider: "needt" as const }]])(
    "resolves exactly as before without provider=chatgpt_plan (%j)",
    async (options) => {
      const result = await getConfiguredSchedulerAI("user-1", options as never);
      expect(chatGptPlanAvailable).not.toHaveBeenCalled();
      expect(getChatGptPlanAccessToken).not.toHaveBeenCalled();
      expect(ChatGptPlanProvider).not.toHaveBeenCalled();
      expect(result.providerReport).toBeNull();
      expect(result.source).toBe("hosted");
    }
  );
});
