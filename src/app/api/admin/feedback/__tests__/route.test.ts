import { NextRequest, NextResponse } from "next/server";

import { summarizeFeedback } from "@/services/feedback/feedback-service";

import { requireAdmin } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

import { GET } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({ requireAdmin: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: { feedbackPrompt: { findMany: jest.fn() } },
}));

const findMany = (
  prisma as unknown as { feedbackPrompt: { findMany: jest.Mock } }
).feedbackPrompt.findMany;

const get = (query = "") =>
  GET(new NextRequest(`http://localhost/api/admin/feedback${query}`));

const row = (over: Record<string, unknown>) => ({
  id: "f",
  kind: "rating",
  shownAt: new Date("2026-11-20T10:00:00Z"),
  answeredAt: new Date("2026-11-20T10:01:00Z"),
  dismissedAt: null,
  rating: null,
  score: null,
  text: null,
  platform: "web",
  appVersion: null,
  user: { email: "a@example.com" },
  ...over,
});

beforeEach(() => {
  jest.resetAllMocks();
  (requireAdmin as jest.Mock).mockResolvedValue(null);
  findMany.mockResolvedValue([]);
});

describe("GET /api/admin/feedback", () => {
  it("is admin only: the guard's refusal is returned and nothing is read", async () => {
    (requireAdmin as jest.Mock).mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );
    const res = await get();
    expect(res.status).toBe(403);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("lists rows with the person's email and the summary", async () => {
    findMany.mockResolvedValue([row({ rating: 5 })]);
    const res = await get();
    const body = await res.json();
    expect(body.items).toEqual([
      expect.objectContaining({ id: "f", email: "a@example.com", rating: 5 }),
    ]);
    expect(body.items[0].user).toBeUndefined();
    expect(body.summary.avgRating).toBe(5);
  });

  it("filters by kind and by an inclusive UTC date range", async () => {
    await get("?kind=nps&from=2026-11-01&to=2026-11-22");
    const where = findMany.mock.calls[0][0].where;
    expect(where.kind).toBe("nps");
    expect(where.shownAt.gte.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    // "to" includes the whole day: the bound is the next midnight, exclusive
    expect(where.shownAt.lt.toISOString()).toBe("2026-11-23T00:00:00.000Z");
  });

  it("rejects an unknown kind and malformed dates", async () => {
    expect((await get("?kind=poem")).status).toBe(400);
    expect((await get("?from=yesterday")).status).toBe(400);
    expect((await get("?to=2026-13-40x")).status).toBe(400);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("summarizeFeedback", () => {
  it("averages ratings and scores and computes the NPS", () => {
    const base = { answeredAt: new Date(), dismissedAt: null };
    const s = summarizeFeedback([
      { ...base, rating: 5, score: null },
      { ...base, rating: 4, score: null },
      { ...base, rating: null, score: 10 },
      { ...base, rating: null, score: 9 },
      { ...base, rating: null, score: 7 },
      { ...base, rating: null, score: 3 },
      { answeredAt: null, dismissedAt: new Date(), rating: null, score: null },
    ]);
    expect(s).toMatchObject({
      shown: 7,
      answered: 6,
      dismissed: 1,
      avgRating: 4.5,
      ratingCount: 2,
      avgScore: 7.3,
      npsCount: 4,
      // 2 promoters, 1 passive, 1 detractor of 4: (2 - 1) / 4 = 25
      nps: 25,
    });
  });

  it("has no averages with no answers", () => {
    expect(summarizeFeedback([])).toMatchObject({
      shown: 0,
      avgRating: null,
      avgScore: null,
      nps: null,
    });
  });
});
