import { REACH_FAILED, refusalFor } from "../refusal";

describe("telling an allowance refusal from a provider that did not answer", () => {
  it("Free: upgrade required keeps the server's words and gates", () => {
    const why = refusalFor(403, {
      error: "The AI agent is available on Needt Pro and Lifetime.",
      code: "UPGRADE_REQUIRED",
      upgradeRequired: true,
    });
    expect(why).toMatchObject({ upgrade: true, allowance: false, gated: true });
    expect(why.text).toBe(
      "The AI agent is available on Needt Pro and Lifetime."
    );
  });

  it("a used allowance is its own state, never 'could not reach'", () => {
    const why = refusalFor(409, { code: "HOSTED_LIMIT_REACHED" });
    expect(why).toMatchObject({ upgrade: false, allowance: true, gated: true });
    expect(why.text).not.toBe(REACH_FAILED);
    expect(why.text).toMatch(/allowance/i);
  });

  it("a refusal with no readable body still does not claim an outage", () => {
    expect(refusalFor(403, null).text).not.toBe(REACH_FAILED);
    expect(refusalFor(409, null).text).not.toBe(REACH_FAILED);
    expect(refusalFor(403, null).gated).toBe(false);
  });

  it("only a request that went out and failed says it could not reach", () => {
    expect(refusalFor(500, null)).toMatchObject({
      text: REACH_FAILED,
      gated: false,
    });
    expect(refusalFor(502, {})).toMatchObject({ text: REACH_FAILED });
  });
});
