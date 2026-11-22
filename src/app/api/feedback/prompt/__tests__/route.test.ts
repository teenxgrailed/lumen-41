import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

import { POST } from "../[id]/route";
import { GET } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    feedbackPrompt: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}));

const db = prisma as unknown as {
  user: { findUnique: jest.Mock };
  feedbackPrompt: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  $queryRaw: jest.Mock;
  $executeRaw: jest.Mock;
  $transaction: jest.Mock;
};
const auth = authenticateRequest as jest.Mock;

const DAY = 24 * 60 * 60 * 1000;
const veteran = {
  createdAt: new Date(Date.now() - 90 * DAY),
  onboardingCompletedAt: new Date(Date.now() - 80 * DAY),
  sandboxKind: null,
  userSettings: null,
};

const get = (query = "") =>
  GET(new NextRequest(`http://localhost/api/feedback/prompt${query}`));
const post = (id: string, body: unknown) =>
  POST(
    new NextRequest(`http://localhost/api/feedback/prompt/${id}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );

beforeEach(() => {
  jest.resetAllMocks();
  auth.mockResolvedValue({ userId: "u1" });
  db.user.findUnique.mockResolvedValue(veteran);
  db.feedbackPrompt.findMany.mockResolvedValue([]);
  db.feedbackPrompt.create.mockResolvedValue({ id: "p1" });
  db.$queryRaw.mockResolvedValue([{ days: 9 }]);
  db.$executeRaw.mockResolvedValue(1);
  db.$transaction.mockImplementation((run: (tx: unknown) => unknown) =>
    run(prisma)
  );
});

describe("GET /api/feedback/prompt", () => {
  it("answers 401 without a session and reads nothing", async () => {
    auth.mockResolvedValue({
      response: new NextResponse("Unauthorized", { status: 401 }),
    });
    const res = await get();
    expect(res.status).toBe(401);
    expect(db.feedbackPrompt.create).not.toHaveBeenCalled();
  });

  it("offers the first kind to an active person and records it as shown, for that user", async () => {
    const res = await get("?platform=ios&appVersion=1.4.0");
    expect(await res.json()).toEqual({ prompt: { id: "p1", kind: "rating" } });
    expect(db.feedbackPrompt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
    expect(db.feedbackPrompt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          kind: "rating",
          platform: "ios",
          appVersion: "1.4.0",
        }),
      })
    );
  });

  it("falls back to web for an unknown platform", async () => {
    await get("?platform=toaster");
    expect(db.feedbackPrompt.create.mock.calls[0][0].data.platform).toBe("web");
  });

  it("offers nothing to an inactive person, without creating a row", async () => {
    db.$queryRaw.mockResolvedValue([{ days: 4 }]);
    expect(await (await get()).json()).toEqual({ prompt: null });
    expect(db.feedbackPrompt.create).not.toHaveBeenCalled();
  });

  it("offers nothing inside the first 7 days, and does not even count activity", async () => {
    db.user.findUnique.mockResolvedValue({
      ...veteran,
      createdAt: new Date(Date.now() - 2 * DAY),
    });
    expect(await (await get()).json()).toEqual({ prompt: null });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("offers nothing within 14 days of the last prompt (dismissed or not)", async () => {
    db.feedbackPrompt.findMany.mockResolvedValue([
      { kind: "rating", shownAt: new Date(Date.now() - 3 * DAY) },
    ]);
    expect(await (await get()).json()).toEqual({ prompt: null });
  });

  it("offers nothing when the setting is off, in onboarding, or to a sandbox login", async () => {
    for (const patch of [
      { userSettings: { feedbackPrompts: false } },
      { onboardingCompletedAt: null },
      { sandboxKind: "reviewer" },
    ]) {
      db.user.findUnique.mockResolvedValue({ ...veteran, ...patch });
      expect(await (await get()).json()).toEqual({ prompt: null });
    }
    expect(db.feedbackPrompt.create).not.toHaveBeenCalled();
  });
});

describe("two tabs asking at once", () => {
  it("create one row, not two: the history is re-read under the person's lock", async () => {
    const rows: { kind: string; shownAt: Date }[] = [];
    db.feedbackPrompt.findMany.mockImplementation(async () => [...rows]);
    db.feedbackPrompt.create.mockImplementation(
      async ({ data }: { data: { kind: string; shownAt: Date } }) => {
        rows.push({ kind: data.kind, shownAt: data.shownAt });
        return { id: `p${rows.length}` };
      }
    );
    // The lock: transactions for one person run one after another.
    let chain: Promise<unknown> = Promise.resolve();
    db.$transaction.mockImplementation((run: (tx: unknown) => unknown) => {
      const next = chain.then(() => run(prisma));
      chain = next.catch(() => undefined);
      return next;
    });
    const [a, b] = await Promise.all([get(), get()]);
    const bodies = [await a.json(), await b.json()];
    expect(db.feedbackPrompt.create).toHaveBeenCalledTimes(1);
    expect(bodies.filter((x) => x.prompt !== null)).toHaveLength(1);
    // the lock statement runs first in each transaction
    expect(db.$executeRaw).toHaveBeenCalledTimes(2);
    const lock = db.$executeRaw.mock.calls[0][0] as {
      sql: string;
      values: unknown[];
    };
    expect(lock.sql).toContain("pg_advisory_xact_lock(hashtextextended(");
    // its own key space, not another feature's lock on the bare user id
    expect(lock.values).toEqual(["feedback-prompt:u1", 0].slice(0, 1));
  });
});

describe("POST /api/feedback/prompt/:id", () => {
  const open = (kind: string) => ({
    id: "p1",
    kind,
    answeredAt: null,
    dismissedAt: null,
  });

  beforeEach(() => {
    db.feedbackPrompt.updateMany.mockResolvedValue({ count: 1 });
  });

  it("answers 401 without a session", async () => {
    auth.mockResolvedValue({
      response: new NextResponse("Unauthorized", { status: 401 }),
    });
    expect((await post("p1", { action: "dismiss" })).status).toBe(401);
    expect(db.feedbackPrompt.findFirst).not.toHaveBeenCalled();
  });

  it("looks the prompt up by id AND owner: another person's prompt is a 404", async () => {
    db.feedbackPrompt.findFirst.mockResolvedValue(null);
    const res = await post("theirs", { action: "dismiss" });
    expect(res.status).toBe(404);
    expect(db.feedbackPrompt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "theirs", userId: "u1" } })
    );
    expect(db.feedbackPrompt.updateMany).not.toHaveBeenCalled();
  });

  it("writes only through an owner-scoped, still-open filter", async () => {
    db.feedbackPrompt.findFirst.mockResolvedValue(open("rating"));
    await post("p1", { action: "answer", rating: 3 });
    expect(db.feedbackPrompt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1", userId: "u1", answeredAt: null, dismissedAt: null },
      })
    );
  });

  it("refuses a second answer", async () => {
    db.feedbackPrompt.findFirst.mockResolvedValue({
      ...open("rating"),
      answeredAt: new Date(),
    });
    expect((await post("p1", { action: "answer", rating: 5 })).status).toBe(
      409
    );
    expect(db.feedbackPrompt.updateMany).not.toHaveBeenCalled();
  });

  it("dismisses: sets dismissedAt, offers no review", async () => {
    db.feedbackPrompt.findFirst.mockResolvedValue(open("rating"));
    const res = await post("p1", { action: "dismiss" });
    expect(await res.json()).toEqual({ ok: true, review: false });
    const data = db.feedbackPrompt.updateMany.mock.calls[0][0].data;
    expect(data.dismissedAt).toBeInstanceOf(Date);
    expect(data.answeredAt).toBeUndefined();
  });

  it("offers the review step only for a 5 out of 5", async () => {
    db.feedbackPrompt.findFirst.mockResolvedValue(open("rating"));
    expect(
      await (await post("p1", { action: "answer", rating: 5 })).json()
    ).toEqual({ ok: true, review: true });
    for (const rating of [1, 2, 3, 4])
      expect(
        await (await post("p1", { action: "answer", rating })).json()
      ).toEqual({ ok: true, review: false });
  });

  it("offers the review step only for an NPS of 9 or 10", async () => {
    db.feedbackPrompt.findFirst.mockResolvedValue(open("nps"));
    for (const score of [9, 10])
      expect(
        (await (await post("p1", { action: "answer", score })).json()).review
      ).toBe(true);
    for (const score of [0, 6, 7, 8])
      expect(
        (await (await post("p1", { action: "answer", score })).json()).review
      ).toBe(false);
  });

  it("never offers a review after a free-text answer, even one that claims a 5", async () => {
    db.feedbackPrompt.findFirst.mockResolvedValue(open("idea"));
    const res = await post("p1", {
      action: "answer",
      rating: 5,
      score: 10,
      text: "dark mode",
    });
    expect(await res.json()).toEqual({ ok: true, review: false });
    // the rating of a text kind is not stored either
    expect(db.feedbackPrompt.updateMany.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ text: "dark mode" })
    );
    expect(
      db.feedbackPrompt.updateMany.mock.calls[0][0].data.rating
    ).toBeUndefined();
  });

  it("stores the optional text with a rating, trimmed", async () => {
    db.feedbackPrompt.findFirst.mockResolvedValue(open("rating"));
    await post("p1", { action: "answer", rating: 4, text: "  nice  " });
    expect(db.feedbackPrompt.updateMany.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ rating: 4, text: "nice" })
    );
  });

  it("rejects what its kind does not accept", async () => {
    db.feedbackPrompt.findFirst.mockResolvedValue(open("rating"));
    expect((await post("p1", { action: "answer" })).status).toBe(400);
    expect((await post("p1", { action: "answer", rating: 6 })).status).toBe(
      400
    );
    expect((await post("p1", { action: "answer", rating: 0 })).status).toBe(
      400
    );
    db.feedbackPrompt.findFirst.mockResolvedValue(open("nps"));
    expect((await post("p1", { action: "answer", score: 11 })).status).toBe(
      400
    );
    db.feedbackPrompt.findFirst.mockResolvedValue(open("annoyance"));
    expect((await post("p1", { action: "answer", text: "  " })).status).toBe(
      400
    );
    expect((await post("p1", { action: "nonsense" })).status).toBe(400);
    expect(db.feedbackPrompt.updateMany).not.toHaveBeenCalled();
  });
});
