import { NextRequest } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { chatGptPlanFlagEnabled } from "@/lib/feature-flags";

import { parseAiProviderChoice } from "../../provider-choice";
import {
  chatGptPlanAvailable,
  getChatGptPlanConfig,
  getChatGptPlanRedirectUri,
} from "../config";

jest.mock("@/lib/feature-flags", () => ({ chatGptPlanFlagEnabled: jest.fn() }));
jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: { aIOAuthConnection: { findUnique: jest.fn() } },
}));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn() },
}));

const flag = chatGptPlanFlagEnabled as jest.Mock;
const prev = { ...process.env };

afterEach(() => {
  process.env = { ...prev };
  jest.clearAllMocks();
});

describe("availability", () => {
  it("is off without a client id, whatever the flag says", async () => {
    delete process.env.OPENAI_SIWC_CLIENT_ID;
    flag.mockResolvedValue(true);
    expect(getChatGptPlanConfig()).toBeNull();
    await expect(chatGptPlanAvailable("u1")).resolves.toBeNull();
  });
  it("is off with the client id but the flag off", async () => {
    process.env.OPENAI_SIWC_CLIENT_ID = "c";
    flag.mockResolvedValue(false);
    await expect(chatGptPlanAvailable("u1")).resolves.toBeNull();
  });
  it("is on with both; the secret is optional", async () => {
    process.env.OPENAI_SIWC_CLIENT_ID = "c";
    flag.mockResolvedValue(true);
    await expect(chatGptPlanAvailable("u1")).resolves.toEqual({
      clientId: "c",
      clientSecret: undefined,
      model: undefined,
    });
  });
  it("redirects to the registered callback path", () => {
    expect(
      getChatGptPlanRedirectUri({ NEXTAUTH_URL: "https://app.needt.app" })
    ).toBe("https://app.needt.app/api/ai/chatgpt-plan/callback");
  });
  it("only the exact string selects the plan", () => {
    expect(parseAiProviderChoice("chatgpt_plan")).toBe("chatgpt_plan");
    for (const v of [undefined, "needt", "CHATGPT_PLAN", 1, null]) {
      expect(parseAiProviderChoice(v)).toBe("needt");
    }
  });
});

describe("routes are invisible when the feature is off", () => {
  beforeEach(() => {
    (authenticateRequest as jest.Mock).mockResolvedValue({ userId: "u1" });
    delete process.env.OPENAI_SIWC_CLIENT_ID;
    flag.mockResolvedValue(true);
  });
  const req = (path: string) => new NextRequest(`https://app.needt.app${path}`);

  it("GET and DELETE status answer 404", async () => {
    const { GET, DELETE } = await import("@/app/api/ai/chatgpt-plan/route");
    expect((await GET(req("/api/ai/chatgpt-plan"))).status).toBe(404);
    expect((await DELETE(req("/api/ai/chatgpt-plan"))).status).toBe(404);
  });
  it("authorize and callback answer 404", async () => {
    const authorize = await import("@/app/api/ai/chatgpt-plan/authorize/route");
    const callback = await import("@/app/api/ai/chatgpt-plan/callback/route");
    expect((await authorize.GET(req("/x"))).status).toBe(404);
    expect((await callback.GET(req("/x?state=s&code=c"))).status).toBe(404);
  });
});
