import { NextRequest } from "next/server";

import * as route from "@/app/api/onboarding/sample/route";
import {
  clearSampleData,
  sampleStatus,
  seedSampleData,
} from "@/services/onboarding/sample-service";

import { authenticateRequest } from "@/lib/auth/api-auth";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/services/onboarding/sample-service", () => ({
  seedSampleData: jest.fn(),
  clearSampleData: jest.fn(),
  sampleStatus: jest.fn(),
}));

type Handler = (r: NextRequest) => Promise<Response>;
const POST = route.POST as unknown as Handler;
const GET = route.GET as unknown as Handler;
const DELETE = route.DELETE as unknown as Handler;

const auth = authenticateRequest as jest.Mock;
const seed = seedSampleData as jest.Mock;
const clear = clearSampleData as jest.Mock;
const status = sampleStatus as jest.Mock;

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/onboarding/sample", {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const NONE = { tasks: 0, projects: 0, pages: 0, habits: 0 };

beforeEach(() => {
  jest.clearAllMocks();
  auth.mockResolvedValue({ userId: "u1", workspace: { workspaceId: "w1" } });
});

it("answers 401-style responses untouched", async () => {
  const response = new Response("Unauthorized", { status: 401 });
  auth.mockResolvedValue({ response });
  expect((await POST(req("POST", {}))).status).toBe(401);
  expect((await DELETE(req("DELETE"))).status).toBe(401);
  expect((await GET(req("GET"))).status).toBe(401);
  expect(seed).not.toHaveBeenCalled();
});

describe("POST", () => {
  it("creates the day (201) and passes the picks through", async () => {
    seed.mockResolvedValue({
      created: true,
      use: "study",
      projectId: "p",
      pageId: "g",
      counts: { tasks: 6, projects: 1, pages: 1, habits: 1 },
    });
    const res = await POST(
      req("POST", { uses: ["study", "side"], timeZone: "Europe/Berlin" })
    );
    expect(res.status).toBe(201);
    expect(seed).toHaveBeenCalledWith({
      userId: "u1",
      workspaceId: "w1",
      uses: ["study", "side"],
      timeZone: "Europe/Berlin",
    });
    expect((await res.json()).created).toBe(true);
  });

  it("answers 200 and created:false on a repeat", async () => {
    seed.mockResolvedValue({
      created: false,
      use: null,
      projectId: null,
      pageId: null,
      counts: NONE,
    });
    const res = await POST(req("POST", {}));
    expect(res.status).toBe(200);
    expect((await res.json()).created).toBe(false);
  });

  it("takes no body at all", async () => {
    seed.mockResolvedValue({ created: false, counts: NONE });
    expect((await POST(req("POST"))).status).toBe(200);
  });

  it("refuses an unknown use or field (400) without touching the database", async () => {
    expect((await POST(req("POST", { uses: ["gaming"] }))).status).toBe(400);
    expect((await POST(req("POST", { extra: 1 }))).status).toBe(400);
    expect(seed).not.toHaveBeenCalled();
  });

  it("reports a failure as 500", async () => {
    seed.mockRejectedValue(new Error("db down"));
    expect((await POST(req("POST", {}))).status).toBe(500);
  });
});

describe("DELETE and GET", () => {
  it("DELETE reports what it removed", async () => {
    clear.mockResolvedValue({ tasks: 6, projects: 1, pages: 1, habits: 1 });
    const res = await DELETE(req("DELETE"));
    expect(clear).toHaveBeenCalledWith({ userId: "u1" });
    expect(await res.json()).toEqual({
      removed: { tasks: 6, projects: 1, pages: 1, habits: 1 },
    });
  });

  it("GET says whether examples are left", async () => {
    status.mockResolvedValue({ present: false, counts: NONE });
    expect(await (await GET(req("GET"))).json()).toEqual({
      present: false,
      counts: NONE,
    });
  });
});
