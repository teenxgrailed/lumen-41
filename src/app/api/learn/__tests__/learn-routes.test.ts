/**
 * /api/learn: who gets in (session or token, flag on), and that every read
 * and write is scoped to the caller's own topics and lessons.
 */
import { NextRequest } from "next/server";

import { PATCH as lessonPATCH } from "@/app/api/learn/lessons/[id]/route";
import { POST as schedulePOST } from "@/app/api/learn/lessons/[id]/schedule/route";
import { GET as overviewGET } from "@/app/api/learn/route";
import { POST as generatePOST } from "@/app/api/learn/topics/[id]/generate/route";
import { GET as topicGET } from "@/app/api/learn/topics/[id]/route";
import { POST as topicsPOST } from "@/app/api/learn/topics/route";
import { getConfiguredSchedulerAI } from "@/services/ai/settings";
import { runOp } from "@/services/ops";
import { authenticateAgentRequest } from "@/services/ops/http";
import { SubscriptionPlan } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { getPlan } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { enforceRateLimits } from "@/lib/security/rate-limit";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/services/ops/http", () => {
  const { NextResponse } = jest.requireActual("next/server");
  return {
    authenticateAgentRequest: jest.fn(),
    opErrorResponse: (error: {
      message: string;
      code?: string;
      status?: number;
    }) =>
      NextResponse.json(
        { error: error.message, code: error.code ?? "INTERNAL" },
        { status: error.status ?? 500 }
      ),
  };
});
jest.mock("@/services/ops", () => ({
  OpError: jest.requireActual("@/services/ops/errors").OpError,
  runOp: jest.fn(),
}));
jest.mock("@/services/ops/helpers", () => ({
  userTimeZone: jest.fn(async () => "Europe/Zurich"),
}));
jest.mock("@/lib/entitlements", () => ({ getPlan: jest.fn() }));
jest.mock("@/services/ai/settings", () => ({
  getConfiguredSchedulerAI: jest.fn(),
  getPreparedSchedulerAI: jest.fn(),
}));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(() => ({})),
  enforceRateLimits: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    learnTopic: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    learnLesson: {
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      createMany: jest.fn(),
    },
  },
}));

const db = prisma as unknown as {
  learnTopic: Record<string, jest.Mock>;
  learnLesson: Record<string, jest.Mock>;
};

const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const NOW = new Date("2026-11-15T09:00:00.000Z");
const topicRow = (fields: Record<string, unknown> = {}) => ({
  id: "t1",
  userId: "u1",
  title: "Deutsch",
  color: "violet",
  icon: "language",
  goal: null,
  level: "A2",
  sampleKey: null,
  order: 1,
  createdAt: NOW,
  updatedAt: NOW,
  lessons: [],
  ...fields,
});
const lessonRow = (fields: Record<string, unknown> = {}) => ({
  id: "l1",
  topicId: "t1",
  userId: "u1",
  title: "Weil",
  source: "AI",
  minutes: 5,
  body: { blocks: [{ kind: "text", text: "Weil." }] },
  status: "new",
  order: 1,
  scheduledTaskId: null,
  completedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...fields,
});

beforeEach(() => {
  jest.clearAllMocks();
  (authenticateAgentRequest as jest.Mock).mockResolvedValue({
    userId: "u1",
    workspace: { id: "w1", role: "OWNER" },
    actor: "user",
  });
  (authenticateRequest as jest.Mock).mockResolvedValue({ userId: "u1" });
  (getPlan as jest.Mock).mockResolvedValue(SubscriptionPlan.PRO);
  (enforceRateLimits as jest.Mock).mockResolvedValue(null);
});

describe("access", () => {
  it("passes an auth failure straight through", async () => {
    const denied = new Response("{}", { status: 401 });
    (authenticateAgentRequest as jest.Mock).mockResolvedValue({
      response: denied,
    });
    const res = await overviewGET(req("/api/learn"));
    expect(res.status).toBe(401);
    expect(db.learnTopic.findMany).not.toHaveBeenCalled();
  });

  it("asks for write access on changes", async () => {
    db.learnTopic.count.mockResolvedValue(0);
    db.learnTopic.findFirst.mockResolvedValue(null);
    db.learnTopic.create.mockResolvedValue(topicRow());
    await topicsPOST(req("/api/learn/topics", "POST", { title: "Deutsch" }));
    expect(authenticateAgentRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      { write: true }
    );
  });
});

describe("ownership", () => {
  it("lists only the caller's topics, with Free's cap", async () => {
    (getPlan as jest.Mock).mockResolvedValue(SubscriptionPlan.FREE);
    db.learnTopic.findMany.mockResolvedValue([
      topicRow({ lessons: [lessonRow()] }),
    ]);
    db.learnLesson.count.mockResolvedValue(0);
    const res = await overviewGET(req("/api/learn"));
    const body = await res.json();
    expect(db.learnTopic.findMany.mock.calls[0][0].where).toEqual({
      userId: "u1",
    });
    expect(body.today).toEqual({ completed: 0, limit: 1 });
    expect(body.topics[0].lessons[0].body).toBeUndefined();
  });

  it("answers 404 for someone else's topic", async () => {
    db.learnTopic.findFirst.mockResolvedValue(null);
    const res = await topicGET(req("/api/learn/topics/t9"), params("t9"));
    expect(res.status).toBe(404);
    expect(db.learnTopic.findFirst.mock.calls[0][0].where).toEqual({
      id: "t9",
      userId: "u1",
    });
  });

  it("creates a topic for the caller, never for a userId in the body", async () => {
    db.learnTopic.count.mockResolvedValue(0);
    db.learnTopic.findFirst.mockResolvedValue(null);
    db.learnTopic.create.mockResolvedValue(topicRow());
    const bad = await topicsPOST(
      req("/api/learn/topics", "POST", { title: "Deutsch", userId: "u2" })
    );
    expect(bad.status).toBe(400);
    const res = await topicsPOST(
      req("/api/learn/topics", "POST", { title: "Deutsch", color: "amber" })
    );
    expect(res.status).toBe(201);
    expect(db.learnTopic.create.mock.calls[0][0].data.userId).toBe("u1");
  });

  it("copies a sample with its lessons", async () => {
    db.learnTopic.findFirst.mockResolvedValue(null);
    db.learnTopic.create.mockResolvedValue(topicRow({ sampleKey: "deutsch" }));
    const res = await topicsPOST(
      req("/api/learn/topics", "POST", { sample: "deutsch" })
    );
    expect(res.status).toBe(201);
    const data = db.learnTopic.create.mock.calls[0][0].data;
    expect(data.sampleKey).toBe("deutsch");
    expect(data.lessons.create.length).toBeGreaterThan(2);
    expect(
      data.lessons.create.every((l: { userId: string }) => l.userId === "u1")
    ).toBe(true);
  });
});

describe("free limits", () => {
  beforeEach(() => {
    (getPlan as jest.Mock).mockResolvedValue(SubscriptionPlan.FREE);
  });

  it("finishes one lesson a day, then asks for Pro", async () => {
    db.learnLesson.findFirst.mockResolvedValue(lessonRow());
    db.learnLesson.count.mockResolvedValue(1);
    const res = await lessonPATCH(
      req("/api/learn/lessons/l1", "PATCH", { status: "done" }),
      params("l1")
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("UPGRADE_REQUIRED");
    expect(db.learnLesson.update).not.toHaveBeenCalled();
  });

  it("finishes the first lesson of the day", async () => {
    db.learnLesson.findFirst.mockResolvedValue(lessonRow());
    db.learnLesson.count.mockResolvedValue(0);
    db.learnLesson.update.mockResolvedValue(
      lessonRow({ status: "done", completedAt: NOW })
    );
    const res = await lessonPATCH(
      req("/api/learn/lessons/l1", "PATCH", { status: "done" }),
      params("l1")
    );
    expect(res.status).toBe(200);
    expect(db.learnLesson.findFirst.mock.calls[0][0].where).toEqual({
      id: "l1",
      userId: "u1",
    });
  });

  it("does not spend AI on Free", async () => {
    db.learnTopic.findFirst.mockResolvedValue(topicRow());
    const res = await generatePOST(
      req("/api/learn/topics/t1/generate", "POST"),
      params("t1")
    );
    expect(await res.json()).toEqual({ status: "upgrade" });
    expect(getConfiguredSchedulerAI).not.toHaveBeenCalled();
    expect(db.learnLesson.createMany).not.toHaveBeenCalled();
  });

  it("keeps the calendar for Pro", async () => {
    const res = await schedulePOST(
      req("/api/learn/lessons/l1/schedule", "POST"),
      params("l1")
    );
    expect(res.status).toBe(403);
    expect(runOp).not.toHaveBeenCalled();
  });
});

describe("put in calendar", () => {
  it("makes an auto-scheduled task and remembers it", async () => {
    db.learnLesson.findFirst.mockResolvedValue(lessonRow());
    (runOp as jest.Mock).mockResolvedValue({
      result: { task: { id: "task1" } },
      actionId: "a1",
    });
    db.learnLesson.update.mockResolvedValue(
      lessonRow({ scheduledTaskId: "task1" })
    );
    const res = await schedulePOST(
      req("/api/learn/lessons/l1/schedule", "POST"),
      params("l1")
    );
    expect(res.status).toBe(201);
    const [name, input, ctx] = (runOp as jest.Mock).mock.calls[0];
    expect(name).toBe("task.create");
    expect(input).toMatchObject({
      title: "Weil",
      estimateMinutes: 5,
      autoSchedule: true,
    });
    expect(ctx.userId).toBe("u1");
    expect((await res.json()).taskId).toBe("task1");
  });

  it("does not schedule someone else's lesson", async () => {
    db.learnLesson.findFirst.mockResolvedValue(null);
    const res = await schedulePOST(
      req("/api/learn/lessons/l9/schedule", "POST"),
      params("l9")
    );
    expect(res.status).toBe(404);
    expect(runOp).not.toHaveBeenCalled();
  });
});
