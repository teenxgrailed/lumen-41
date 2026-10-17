import {
  DEFAULT_HOSTED_AI_MODEL,
  ZAI_BASE_URL,
  aiHostKind,
  resolveHostedAiEndpoint,
} from "../endpoint";

jest.mock("@/lib/entitlements", () => ({ getPlan: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("hosted AI endpoint", () => {
  it("defaults to GLM 5.3 Flash on OpenRouter", () => {
    expect(resolveHostedAiEndpoint({})).toEqual({
      baseUrl: "https://openrouter.ai/api/v1",
      model: DEFAULT_HOSTED_AI_MODEL,
      kind: "openrouter",
    });
  });

  it("points at Z.ai with its own model code when only the URL is set", () => {
    expect(
      resolveHostedAiEndpoint({ NEEDT_AI_BASE_URL: ZAI_BASE_URL })
    ).toEqual({ baseUrl: ZAI_BASE_URL, model: "glm-5.3-flash", kind: "zai" });
  });

  it("strips the OpenRouter vendor prefix on Z.ai", () => {
    expect(
      resolveHostedAiEndpoint({
        NEEDT_AI_BASE_URL: ZAI_BASE_URL,
        NEEDT_AI_MODEL: "z-ai/glm-5.3-flash",
      }).model
    ).toBe("glm-5.3-flash");
  });

  it("keeps the model id as typed on any other host", () => {
    expect(
      resolveHostedAiEndpoint({
        NEEDT_AI_BASE_URL: "https://llm.example.com/v1",
        NEEDT_AI_MODEL: "vendor/model",
      })
    ).toEqual({
      baseUrl: "https://llm.example.com/v1",
      model: "vendor/model",
      kind: "other",
    });
  });

  it("classifies hosts and survives a bad URL", () => {
    expect(aiHostKind("https://open.bigmodel.cn/api/paas/v4")).toBe("zai");
    expect(aiHostKind("https://eu.openrouter.ai/api/v1")).toBe("openrouter");
    expect(aiHostKind("not a url")).toBe("other");
  });
});

describe("gateway routing follows the host", () => {
  it("sends no OpenRouter routing to Z.ai or another host", async () => {
    const { hostedAiRoutingBody } = await import("../usage");
    expect(hostedAiRoutingBody("glm-5.3-flash", "zai")).toEqual({});
    expect(hostedAiRoutingBody("x", "other")).toEqual({});
    expect(
      hostedAiRoutingBody(DEFAULT_HOSTED_AI_MODEL, "openrouter")
    ).toHaveProperty("provider");
  });
});
