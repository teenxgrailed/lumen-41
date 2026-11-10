import { NextRequest } from "next/server";

import { PATCH } from "@/app/api/ai-settings/route";
import { ensureAISettings } from "@/services/ai/settings";

import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn().mockResolvedValue({ userId: "user-1" }),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/services/ai/encryption", () => ({
  encryptSecret: jest.fn((value: string) => `enc:${value}`),
}));
jest.mock("@/services/ai/settings", () => ({
  defaultModelForProvider: jest.fn(() => "default-model"),
  getDefaultCustomAIUrl: jest.fn(() => null),
  ensureAISettings: jest.fn(),
  publicAISettingsWithOAuth: jest.fn(async () => ({})),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: { aISettings: { update: jest.fn().mockResolvedValue({}) } },
}));

const saved = {
  provider: "ANTHROPIC",
  model: "claude-x",
  customUrl: "https://example.test/ai",
  soulPreset: "coach",
  allowParseTasks: true,
  allowReorder: true,
  allowSuggestEnergy: false,
  allowFullAuto: true,
  requestTimeoutSeconds: 45,
};

function patch(body: unknown) {
  return PATCH(
    new NextRequest("http://localhost/api/ai-settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(ensureAISettings).mockResolvedValue(saved as never);
});

describe("PATCH /api/ai-settings", () => {
  it("keeps every saved value that the body omits", async () => {
    await patch({ model: "claude-y" });
    const data = jest.mocked(prisma.aISettings.update).mock.calls[0][0].data;
    expect(data).toMatchObject({
      provider: "ANTHROPIC",
      model: "claude-y",
      customUrl: "https://example.test/ai",
      soulPreset: "coach",
      allowParseTasks: true,
      allowReorder: true,
      allowSuggestEnergy: false,
      allowFullAuto: true,
      requestTimeoutSeconds: 45,
    });
  });

  it("writes an explicit false", async () => {
    await patch({ allowReorder: false });
    const data = jest.mocked(prisma.aISettings.update).mock.calls[0][0].data;
    expect(data.allowReorder).toBe(false);
    expect(data.allowFullAuto).toBe(true);
  });
});
