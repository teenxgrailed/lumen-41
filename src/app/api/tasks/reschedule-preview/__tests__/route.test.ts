import { NextRequest } from "next/server";

import {
  applyReschedulePreview,
  createReschedulePreview,
  undoReschedulePreview,
} from "@/services/ai/reschedule-preview";

import { POST } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn().mockResolvedValue({
    userId: "u1",
    workspace: { workspaceId: "w1" },
  }),
}));
const limit = jest.fn().mockResolvedValue(null);
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn((...a: unknown[]) => a),
  enforceRateLimits: (...a: unknown[]) => limit(...a),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/services/ai/reschedule-preview", () => ({
  SchedulePreviewConflictError: class extends Error {},
  createReschedulePreview: jest.fn().mockResolvedValue({}),
  applyReschedulePreview: jest.fn().mockResolvedValue({}),
  undoReschedulePreview: jest.fn().mockResolvedValue({}),
}));

function call(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/tasks/reschedule-preview", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  limit.mockResolvedValue(null);
});

describe("reschedule-preview route: rate limit", () => {
  it("answers 429 over the limit and does nothing", async () => {
    limit.mockResolvedValueOnce(
      Response.json({ error: "Too many requests" }, { status: 429 })
    );
    const res = await call({ action: "preview" });
    expect(res?.status).toBe(429);
    expect(createReschedulePreview).not.toHaveBeenCalled();
  });
});

describe("reschedule-preview route: via", () => {
  it("defaults to the chat card", async () => {
    await call({ action: "preview" });
    await call({ action: "apply", token: "t" });
    await call({ action: "undo", token: "t" });
    expect(createReschedulePreview).toHaveBeenCalledWith(
      "u1",
      expect.anything(),
      { via: "chat" }
    );
    expect(applyReschedulePreview).toHaveBeenCalledWith(
      "u1",
      expect.anything(),
      "t",
      { via: "chat" }
    );
    expect(undoReschedulePreview).toHaveBeenCalledWith(
      "u1",
      expect.anything(),
      "t",
      { via: "chat" }
    );
  });

  it("passes via fill through so Fill it is not counted as Keep", async () => {
    await call({ action: "preview", via: "fill" });
    await call({ action: "apply", token: "t", via: "fill" });
    expect(createReschedulePreview).toHaveBeenCalledWith(
      "u1",
      expect.anything(),
      { via: "fill" }
    );
    expect(applyReschedulePreview).toHaveBeenCalledWith(
      "u1",
      expect.anything(),
      "t",
      { via: "fill" }
    );
  });
});

describe("reschedule-preview route: taskIds", () => {
  it("passes taskIds to the preview and leaves them out when not given", async () => {
    await call({ action: "preview", taskIds: ["a", "b"] });
    expect(createReschedulePreview).toHaveBeenLastCalledWith(
      "u1",
      expect.anything(),
      { via: "chat", taskIds: ["a", "b"] }
    );
    await call({ action: "preview" });
    const options = (createReschedulePreview as jest.Mock).mock.calls.at(
      -1
    )?.[2];
    expect(options).toEqual({ via: "chat" });
    expect("taskIds" in options).toBe(false);
  });

  it("rejects an empty list, more than 100 ids and non-string ids", async () => {
    for (const taskIds of [
      [],
      Array.from({ length: 101 }, (_, i) => `t${i}`),
      [1],
    ]) {
      const res = await call({ action: "preview", taskIds });
      expect(res?.status).toBe(400);
    }
    expect(createReschedulePreview).not.toHaveBeenCalled();
  });

  it("does not take taskIds on apply: the token holds the set", async () => {
    await call({ action: "apply", token: "t", taskIds: ["x"] });
    expect(applyReschedulePreview).toHaveBeenCalledWith(
      "u1",
      expect.anything(),
      "t",
      { via: "chat" }
    );
  });
});

describe("reschedule-preview route: home_missed", () => {
  it("accepts via home_missed on all three steps and rejects unknown values", async () => {
    await call({ action: "preview", via: "home_missed", taskIds: ["a"] });
    await call({ action: "apply", token: "t", via: "home_missed" });
    await call({ action: "undo", token: "t", via: "home_missed" });
    expect(createReschedulePreview).toHaveBeenCalledWith(
      "u1",
      expect.anything(),
      { via: "home_missed", taskIds: ["a"] }
    );
    expect(applyReschedulePreview).toHaveBeenCalledWith(
      "u1",
      expect.anything(),
      "t",
      { via: "home_missed" }
    );
    expect(undoReschedulePreview).toHaveBeenCalledWith(
      "u1",
      expect.anything(),
      "t",
      { via: "home_missed" }
    );
    const res = await call({ action: "preview", via: "nope" });
    expect(res?.status).toBe(400);
  });
});
