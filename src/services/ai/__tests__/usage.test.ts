import { getPlan } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { SANDBOX_AI_DAILY_ACTION_CAP } from "@/lib/sandbox/policy";

import {
  claimHostedAiAction,
  hostedAiCeilingMultiplier,
  recordHostedAiTokens,
  releaseHostedAiAction,
} from "../usage";

jest.mock("@/lib/entitlements", () => ({ getPlan: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    aiUsage: { findUnique: jest.fn(), upsert: jest.fn() },
    user: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

const aiUsage = prisma.aiUsage as unknown as {
  upsert: jest.Mock;
};

describe("hosted AI token metering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("atomically adds normalized provider token counts", async () => {
    aiUsage.upsert.mockResolvedValue({});

    await recordHostedAiTokens("user-1", {
      inputTokens: 12.8,
      outputTokens: -2,
    });

    expect(aiUsage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: "user-1",
          inputTokens: 12,
          outputTokens: 0,
        }),
        update: {
          inputTokens: { increment: 12 },
          outputTokens: { increment: 0 },
        },
      })
    );
  });

  it("does not create an empty metering row", async () => {
    await recordHostedAiTokens("user-1", {
      inputTokens: Number.NaN,
      outputTokens: 0,
    });

    expect(aiUsage.upsert).not.toHaveBeenCalled();
  });
});

describe("hosted AI action claims", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPlan).mockResolvedValue("PRO");
  });

  it("claims an action atomically and classifies overflow as slow", async () => {
    jest.mocked(prisma.$queryRaw).mockResolvedValue([{ actionCount: 301 }]);

    await expect(claimHostedAiAction("user-1")).resolves.toMatchObject({
      claimed: true,
      mode: "slow",
      usage: { used: 301, allowed: true },
    });

    const sql = (prisma.$queryRaw as jest.Mock).mock.calls[0][0].join(" ");
    expect(sql).toContain("ON CONFLICT");
    expect(sql).toContain('WHERE "AiUsage"."actionCount" <');
  });

  it("holds a sandbox account to its small daily cap with no slow lane", async () => {
    jest
      .mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ sandboxKind: "reviewer" } as never);
    jest.mocked(prisma.$queryRaw).mockResolvedValue([{ actionCount: 3 }]);

    await expect(claimHostedAiAction("sandbox-1")).resolves.toMatchObject({
      claimed: true,
      mode: "normal",
      usage: {
        limit: SANDBOX_AI_DAILY_ACTION_CAP,
        ceiling: SANDBOX_AI_DAILY_ACTION_CAP,
      },
    });
    const values = (prisma.$queryRaw as jest.Mock).mock.calls[0].slice(1);
    expect(values).toContain(SANDBOX_AI_DAILY_ACTION_CAP);
  });

  it("denies the action when the atomic claim returns no row", async () => {
    jest.mocked(prisma.$queryRaw).mockResolvedValue([]);

    await expect(claimHostedAiAction("user-1")).resolves.toMatchObject({
      claimed: false,
      mode: "blocked",
      usage: { allowed: false, exhausted: true },
    });
  });

  it("defaults invalid ceiling multipliers and clamps small values", () => {
    expect(hostedAiCeilingMultiplier(Number.NaN)).toBe(2);
    expect(hostedAiCeilingMultiplier(0)).toBe(1);
    expect(hostedAiCeilingMultiplier(1)).toBe(1);
  });

  it("releases a failed queue reservation from the claimed month", async () => {
    jest.mocked(prisma.$executeRaw).mockResolvedValue(1);

    await releaseHostedAiAction("user-1", "2026-09");

    const sql = (prisma.$executeRaw as jest.Mock).mock.calls[0][0].join(" ");
    expect(sql).toContain('UPDATE "AiUsage"');
    expect(sql).toContain('"actionCount" - 1');
  });
});
