import {
  DEFAULT_HOSTED_AI_MODEL,
  DEFAULT_MODEL_US_EU_PROVIDERS,
  NON_US_EU_PROVIDERS,
  hostedAiRoutingBody,
} from "../usage";

jest.mock("@/lib/entitlements", () => ({ getPlan: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("hosted AI gateway routing", () => {
  const previous = process.env.NEEDT_AI_GATEWAY_PROVIDERS;

  afterEach(() => {
    if (previous === undefined) delete process.env.NEEDT_AI_GATEWAY_PROVIDERS;
    else process.env.NEEDT_AI_GATEWAY_PROVIDERS = previous;
  });

  it("routes the default model only to US/EU hosts that keep no data", () => {
    delete process.env.NEEDT_AI_GATEWAY_PROVIDERS;

    expect(hostedAiRoutingBody(DEFAULT_HOSTED_AI_MODEL)).toEqual({
      provider: {
        data_collection: "deny",
        only: [...DEFAULT_MODEL_US_EU_PROVIDERS],
        ignore: [...NON_US_EU_PROVIDERS],
      },
    });
  });

  it("never allows a host outside the US and the EU", () => {
    for (const slug of ["z-ai", "streamlake", "siliconflow"]) {
      expect(DEFAULT_MODEL_US_EU_PROVIDERS).not.toContain(slug);
      expect(NON_US_EU_PROVIDERS).toContain(slug);
    }
  });

  it("drops refused hosts from a configured allow-list", () => {
    process.env.NEEDT_AI_GATEWAY_PROVIDERS = "z-ai/fp8, fireworks/us,together";

    expect(hostedAiRoutingBody(DEFAULT_HOSTED_AI_MODEL).provider).toEqual({
      data_collection: "deny",
      only: ["fireworks/us", "together"],
      ignore: [...NON_US_EU_PROVIDERS],
    });
  });

  it("does not pin the default model's hosts onto a different model", () => {
    delete process.env.NEEDT_AI_GATEWAY_PROVIDERS;

    expect(hostedAiRoutingBody("some-vendor/other-model").provider).toEqual({
      data_collection: "deny",
      ignore: [...NON_US_EU_PROVIDERS],
    });
  });
});
