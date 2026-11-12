import { NextRequest } from "next/server";

import { createFakePrisma } from "@/services/ops/__tests__/fake-prisma";
import { access } from "@/services/ops/__tests__/harness";
import { authenticateAgentRequest } from "@/services/ops/http";
import { WorkspaceRole } from "@prisma/client";

import { DELETE, PATCH, GET as getOne } from "../[id]/route";
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
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));

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
  signedIn();
});

describe("/api/charts", () => {
  it("adds a Home chart, lists it by place, reads, changes and removes it", async () => {
    const created = await POST(
      request("/api/charts", "POST", { metric: "time_spent", rangeDays: 7 })
    );
    expect(created.status).toBe(201);
    const run = await created.json();
    expect(run.actionId).toEqual(expect.any(String));
    const id = run.result.chart.id;

    const home = await (await GET(request("/api/charts?home=true"))).json();
    expect(home.charts).toHaveLength(1);
    expect(home.charts[0].series.points).toHaveLength(7);
    const project = await (
      await GET(request("/api/charts?projectId=p-1"))
    ).json();
    expect(project.charts).toHaveLength(0);
    const bare = await (await GET(request("/api/charts?series=false"))).json();
    expect(bare.charts[0].series).toBeUndefined();

    const one = await (
      await getOne(request(`/api/charts/${id}`), params(id))
    ).json();
    expect(one.chart.series.summary.metric).toBe("time_spent");

    const patched = await PATCH(
      request(`/api/charts/${id}`, "PATCH", { style: "line" }),
      params(id)
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).result.chart.style).toBe("line");

    const removed = await DELETE(
      request(`/api/charts/${id}`, "DELETE"),
      params(id)
    );
    expect(removed.status).toBe(200);
    expect(
      (await (await GET(request("/api/charts"))).json()).charts
    ).toHaveLength(0);
  });

  it("answers 400 for a bad body and 404 for a missing chart", async () => {
    const bad = await POST(request("/api/charts", "POST", { metric: "mood" }));
    expect(bad.status).toBe(400);
    const missing = await getOne(request("/api/charts/nope"), params("nope"));
    expect(missing.status).toBe(404);
  });

  it("a viewer cannot add a chart", async () => {
    signedIn(WorkspaceRole.VIEWER);
    const refused = await POST(
      request("/api/charts", "POST", { metric: "time_spent" })
    );
    expect(refused.status).toBe(403);
  });
});
