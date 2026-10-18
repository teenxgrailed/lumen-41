import { assembleAgentSystemPrompt } from "../system-prompt";
import { hostedUsageStatus, resolveAiAccessMode } from "../usage";

describe("agent prompt assembly", () => {
  it("ranks memories and stays within the requested budget", () => {
    const result = assembleAgentSystemPrompt({
      soulPreset: "business",
      scheduleSummary: "Two scheduled tasks.",
      tokenBudget: 400,
      memories: [
        {
          id: "low",
          kind: "fact",
          content: "Low value",
          weight: 0.1,
          lastUsedAt: new Date(0),
        },
        {
          id: "high",
          kind: "preference",
          content: "Prefer deep work before noon",
          weight: 9,
          lastUsedAt: new Date(),
        },
      ],
    });
    expect(result.estimatedTokens).toBeLessThanOrEqual(400);
    expect(result.usedMemoryIds[0]).toBe("high");
  });
});

describe("agent prompt and the learning switch", () => {
  const base = {
    soulPreset: "business",
    scheduleSummary: "",
    memories: [],
    agent: { now: "Monday", timeZone: "UTC" },
  };

  it("tells Ask to save stated preferences and say so, only while learning is on", () => {
    const on = assembleAgentSystemPrompt({ ...base, learning: true }).prompt;
    expect(on).toMatch(/remember tool and say in your reply that you saved it/);
    const off = assembleAgentSystemPrompt({ ...base, learning: false }).prompt;
    expect(off).toMatch(/memory is off/);
    expect(off).not.toMatch(/remember tool/);
    expect(assembleAgentSystemPrompt(base).prompt).toMatch(/memory is off/);
  });
});

describe("hosted AI metering", () => {
  it("uses normal, slow, and blocked modes at the configured boundaries", () => {
    const cap = hostedUsageStatus(Number.MAX_SAFE_INTEGER, "PRO").limit;
    expect(hostedUsageStatus(cap - 1, "PRO", 2).mode).toBe("normal");
    expect(hostedUsageStatus(cap, "PRO", 2)).toMatchObject({
      allowed: true,
      mode: "slow",
    });
    expect(hostedUsageStatus(cap * 2 - 1, "PRO", 2).mode).toBe("slow");
    expect(hostedUsageStatus(cap * 2, "PRO", 2)).toMatchObject({
      allowed: false,
      mode: "blocked",
    });
    // A free account now carries a small allowance of its own, so an unused
    // one is in normal mode, and only exhausting it blocks.
    const freeCap = hostedUsageStatus(Number.MAX_SAFE_INTEGER, "FREE").limit;
    expect(freeCap).toBeGreaterThan(0);
    expect(hostedUsageStatus(0, "FREE", 2).mode).toBe("normal");
    expect(hostedUsageStatus(freeCap * 2, "FREE", 2)).toMatchObject({
      allowed: false,
      mode: "blocked",
    });
  });

  it("prefers BYOK and only falls back to hosted while allowance remains", () => {
    expect(
      resolveAiAccessMode({
        hasByok: true,
        hostedAvailable: true,
        hostedAllowed: false,
      })
    ).toBe("byok");
    expect(
      resolveAiAccessMode({
        hasByok: false,
        hostedAvailable: true,
        hostedAllowed: true,
      })
    ).toBe("hosted");
    expect(
      resolveAiAccessMode({
        hasByok: false,
        hostedAvailable: true,
        hostedAllowed: false,
      })
    ).toBe("none");
  });
});
