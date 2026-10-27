import { NextRequest, NextResponse } from "next/server";

import { createFakePrisma } from "@/services/ops/__tests__/fake-prisma";
import { access } from "@/services/ops/__tests__/harness";
import { authenticateAgentRequest } from "@/services/ops/http";
import { WorkspaceRole } from "@prisma/client";

import {
  GET as checkInsGet,
  POST as checkInsPost,
} from "../[id]/check-ins/route";
import { DELETE, PATCH, GET as getOne } from "../[id]/route";
import { POST as convertPost } from "../convert-task/route";
import { GET, POST } from "../route";

const mockState = { db: createFakePrisma() };

jest.mock("@/services/ops/http", () => ({
  ...jest.requireActual("@/services/ops/http"),
  authenticateAgentRequest: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockState.db.client;
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn(),
}));
jest.mock("@/lib/entitlements", () => ({
  getPlan: jest.fn().mockResolvedValue("PRO"),
  canUseGoals: jest.fn(),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const entitlements = require("@/lib/entitlements");

function request(path: string, method = "GET", body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function signedIn(role: WorkspaceRole = WorkspaceRole.OWNER) {
  jest.mocked(authenticateAgentRequest).mockResolvedValue({
    userId: "user-1",
    workspace: access(role),
    actor: "user",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.db = createFakePrisma();
  entitlements.canUseGoals.mockResolvedValue({
    allowed: true,
    upgradeRequired: false,
    plan: "PRO",
  });
  signedIn();
});

describe("/api/goals", () => {
  it("creates, lists, reads, changes and archives a goal", async () => {
    const created = await POST(
      request("/api/goals", "POST", { title: "Run 10k", percent: 20 })
    );
    expect(created.status).toBe(201);
    const run = await created.json();
    const id = run.result.goal.id;
    expect(run.actionId).toEqual(expect.any(String));
    expect(jest.mocked(authenticateAgentRequest).mock.calls[0][2]).toEqual({
      write: true,
    });

    const listed = await (await GET(request("/api/goals"))).json();
    expect(listed.goals.map((g: { id: string }) => g.id)).toEqual([id]);

    const patched = await PATCH(
      request(`/api/goals/${id}`, "PATCH", { status: "achieved" }),
      params(id)
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).result.goal.status).toBe("achieved");

    const one = await (
      await getOne(request(`/api/goals/${id}`), params(id))
    ).json();
    expect(one.goal.progress.percent).toBe(100);

    const removed = await DELETE(
      request(`/api/goals/${id}`, "DELETE"),
      params(id)
    );
    expect(removed.status).toBe(200);
    const after = await (await GET(request("/api/goals"))).json();
    expect(after.goals).toEqual([]);
  });

  it("records a check-in and lists the history", async () => {
    const created = await (
      await POST(request("/api/goals", "POST", { title: "Read", percent: 10 }))
    ).json();
    const id = created.result.goal.id;
    const checked = await checkInsPost(
      request(`/api/goals/${id}/check-ins`, "POST", {
        percent: 40,
        note: "Two books",
      }),
      params(id)
    );
    expect(checked.status).toBe(201);
    const history = await (
      await checkInsGet(request(`/api/goals/${id}/check-ins`), params(id))
    ).json();
    expect(history.checkIns).toEqual([
      expect.objectContaining({ percent: 40, note: "Two books" }),
    ]);
  });

  it("converts a task", async () => {
    const task = await mockState.db.seed("task", {
      title: "GOAL: Move to Zurich",
      userId: "user-1",
      assigneeId: "user-1",
      workspaceId: "ws-1",
    });
    const converted = await convertPost(
      request("/api/goals/convert-task", "POST", { taskId: task.id })
    );
    expect(converted.status).toBe(201);
    expect((await converted.json()).result.goal.title).toBe("Move to Zurich");
  });

  it("answers Free 403 UPGRADE_REQUIRED, a viewer 403, a bad body 400, an unknown goal 404", async () => {
    entitlements.canUseGoals.mockResolvedValue({
      allowed: false,
      upgradeRequired: true,
      plan: "FREE",
    });
    const free = await POST(request("/api/goals", "POST", { title: "x" }));
    expect(free.status).toBe(403);
    expect((await free.json()).code).toBe("UPGRADE_REQUIRED");

    signedIn(WorkspaceRole.VIEWER);
    const viewer = await PATCH(
      request("/api/goals/g", "PATCH", { title: "y" }),
      params("g")
    );
    expect(viewer.status).toBe(403);

    signedIn();
    const bad = await POST(
      new NextRequest("http://localhost/api/goals", {
        method: "POST",
        body: "not json",
      })
    );
    expect(bad.status).toBe(400);
    const missing = await getOne(request("/api/goals/nope"), params("nope"));
    expect(missing.status).toBe(404);
  });

  it("passes an authentication failure through", async () => {
    jest.mocked(authenticateAgentRequest).mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await GET(request("/api/goals"))).status).toBe(401);
  });
});
