import { NextRequest, NextResponse } from "next/server";

import { POST as postClose } from "@/app/api/day-plan/close/route";
import { GET as getPlan, PUT as putPlan } from "@/app/api/day-plan/route";
import { PUT as putSettings } from "@/app/api/day-plan/settings/route";
import { GET as getSomeday } from "@/app/api/someday/route";
import { createDayPlanDb } from "@/services/day-plan/__tests__/fake-db";
import {
  OTHER,
  TODAY,
  USER,
  seedPlan,
  seedTask,
} from "@/services/day-plan/__tests__/helpers";

import { authenticateRequest } from "@/lib/auth/api-auth";

const mockState = { db: createDayPlanDb() };

jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockState.db.client;
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimits: jest.fn().mockResolvedValue(null),
  ipRule: jest.fn(),
  accountRule: jest.fn(),
}));
jest.mock("@/lib/activation-events", () => ({ recordActivation: jest.fn() }));
jest.mock("@/services/ai/parse-tasks", () => ({
  parseTasksForUser: jest.fn(),
}));

const auth = authenticateRequest as jest.Mock;

const request = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  mockState.db = createDayPlanDb();
  mockState.db.insert("userSettings", { userId: USER, timeZone: "UTC" });
  auth.mockResolvedValue({ userId: USER });
});

describe("day plan routes", () => {
  it("answers 401 for a signed-out request", async () => {
    auth.mockResolvedValue({
      response: new NextResponse("Unauthorized", { status: 401 }),
    });
    expect((await getPlan(request(`/api/day-plan?date=${TODAY}`))).status).toBe(
      401
    );
    expect((await getSomeday(request("/api/someday"))).status).toBe(401);
  });

  it("rejects an out-of-range limit with a 400 naming the range", async () => {
    const res = await putSettings(
      request("/api/day-plan/settings", "PUT", { taskLimit: 11 })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_input");
    expect(body.message).toMatch(/between 3 and 10/);
    expect(mockState.db.tables.planSettings).toHaveLength(0);
  });

  it("rejects a bad date and unknown fields", async () => {
    expect((await getPlan(request("/api/day-plan?date=tomorrow"))).status).toBe(
      400
    );
    const res = await putPlan(
      request("/api/day-plan", "PUT", { date: TODAY, items: [], nope: true })
    );
    expect(res.status).toBe(400);
  });

  it("answers another person's task as not found and changes nothing", async () => {
    const theirs = seedTask(mockState.db, { userId: OTHER });
    seedPlan(
      mockState.db,
      TODAY,
      [String(theirs.id)],
      { status: "active" },
      OTHER
    );

    const put = await putPlan(
      request("/api/day-plan", "PUT", {
        date: TODAY,
        items: [{ taskId: theirs.id }],
      })
    );
    expect(put.status).toBe(404);
    const close = await postClose(
      request("/api/day-plan/close", "POST", { date: TODAY, resolutions: [] })
    );
    expect(close.status).toBe(404);
    const get = await getPlan(request(`/api/day-plan?date=${TODAY}`));
    expect((await get.json()).plan).toBeNull();
  });
});
