import { NextRequest } from "next/server";

import { POST as CREATE } from "@/app/api/starter-game/create/route";
import { POST as PLAN } from "@/app/api/starter-game/plan/route";
import { GET, PATCH } from "@/app/api/starter-game/route";
import { runOp } from "@/services/ops";
import { makeStarterPlan } from "@/services/starter-game/agent";
import {
  hideStarterGame,
  readStarterStatus,
} from "@/services/starter-game/state";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { enforceRateLimits } from "@/lib/security/rate-limit";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(() => ({})),
  enforceRateLimits: jest.fn(),
}));
jest.mock("@/services/ops", () => ({ runOp: jest.fn() }));
jest.mock("@/services/ops/http", () => ({
  opErrorResponse: jest.fn(() => new Response("{}", { status: 403 })),
}));
jest.mock("@/services/starter-game/agent", () => ({
  makeStarterPlan: jest.fn(),
}));
jest.mock("@/services/starter-game/state", () => ({
  readStarterStatus: jest.fn(),
  hideStarterGame: jest.fn(),
}));

const req = (method: string, url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const STATUS = {
  hiddenUntil: null,
  neverShow: false,
  hidden: false,
  openTasks: 1,
  eligible: true,
  canPlay: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  (authenticateRequest as jest.Mock).mockResolvedValue({
    userId: "u1",
    workspace: { workspaceId: "w1" },
  });
  (enforceRateLimits as jest.Mock).mockResolvedValue(null);
  (readStarterStatus as jest.Mock).mockResolvedValue(STATUS);
});

describe("/api/starter-game", () => {
  it("GET returns the state", async () => {
    const res = (await GET(req("GET", "/api/starter-game"))) as Response;
    expect(await res.json()).toEqual(STATUS);
  });

  it("PATCH hides and returns the new state", async () => {
    const res = (await PATCH(
      req("PATCH", "/api/starter-game", { hide: "7d" })
    )) as Response;
    expect(res.status).toBe(200);
    expect(hideStarterGame).toHaveBeenCalledWith("u1", "7d");
  });

  it("PATCH refuses an unknown value", async () => {
    const res = (await PATCH(
      req("PATCH", "/api/starter-game", { hide: "forever" })
    )) as Response;
    expect(res.status).toBe(400);
    expect(hideStarterGame).not.toHaveBeenCalled();
  });
});

describe("POST /api/starter-game/plan", () => {
  it("passes the three answers to the one agent request", async () => {
    (makeStarterPlan as jest.Mock).mockResolvedValue({
      status: "ready",
      items: [],
      suggestions: {},
    });
    const res = (await PLAN(
      req("POST", "/api/starter-game/plan", {
        do: "Work",
        burn: "Report",
        reg: "Walk",
      })
    )) as Response;
    expect((await res.json()).status).toBe("ready");
    expect(makeStarterPlan).toHaveBeenCalledWith({
      userId: "u1",
      answers: { do: "Work", burn: "Report", reg: "Walk" },
    });
  });

  it("refuses empty answers before any AI action", async () => {
    const res = (await PLAN(
      req("POST", "/api/starter-game/plan", {})
    )) as Response;
    expect(res.status).toBe(400);
    expect(makeStarterPlan).not.toHaveBeenCalled();
  });

  it("is limited per account", async () => {
    (enforceRateLimits as jest.Mock).mockResolvedValue(
      new Response("{}", { status: 429 })
    );
    const res = (await PLAN(
      req("POST", "/api/starter-game/plan", { burn: "x" })
    )) as Response;
    expect(res.status).toBe(429);
    expect(makeStarterPlan).not.toHaveBeenCalled();
  });
});

describe("POST /api/starter-game/create", () => {
  it("runs starter.create once and returns the one action id", async () => {
    (runOp as jest.Mock).mockResolvedValue({
      result: { counts: { tasks: 1, habits: 0, projects: 0 } },
      actionId: "a1",
      undoable: true,
      undoableUntil: null,
    });
    const body = { tasks: [{ title: "Call", group: "today" }] };
    const res = (await CREATE(
      req("POST", "/api/starter-game/create", body)
    )) as Response;
    expect(await res.json()).toMatchObject({ actionId: "a1", undoable: true });
    expect(runOp).toHaveBeenCalledTimes(1);
    expect((runOp as jest.Mock).mock.calls[0][0]).toBe("starter.create");
  });

  it("refuses an empty request", async () => {
    const res = (await CREATE(
      req("POST", "/api/starter-game/create", { tasks: [] })
    )) as Response;
    expect(res.status).toBe(400);
    expect(runOp).not.toHaveBeenCalled();
  });
});
