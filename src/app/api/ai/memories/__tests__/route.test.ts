import { NextRequest } from "next/server";

import { DELETE, GET, PATCH } from "@/app/api/ai/memories/route";
import {
  clearAgentMemories,
  clearAllAgentMemories,
  forgetForUser,
  isLearningEnabled,
  listAgentMemories,
  setLearningEnabled,
  updateMemoryForUser,
} from "@/services/ai/memory";
import { runLearning } from "@/services/ai/memory-learning";

import { authenticateRequest } from "@/lib/auth/api-auth";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/services/ai/memory", () => ({
  ...jest.requireActual("@/services/ai/memory"),
  clearAgentMemories: jest.fn(),
  clearAllAgentMemories: jest.fn(),
  forgetForUser: jest.fn(),
  isLearningEnabled: jest.fn(),
  listAgentMemories: jest.fn(),
  setLearningEnabled: jest.fn(),
  updateMemoryForUser: jest.fn(),
}));
jest.mock("@/services/ai/memory-learning", () => ({ runLearning: jest.fn() }));

const workspace = { workspaceId: "ws-1" };
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/ai/memories", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const call = async (
  fn: (r: NextRequest) => Promise<Response | undefined>,
  r: NextRequest
) => {
  const res = (await fn(r)) as Response;
  return { status: res.status, body: await res.json() };
};

const row = {
  id: "m1",
  kind: "preference",
  content: "No meetings before 10",
  source: "chat",
  sourceKey: "internal",
  data: { ratio: 1 },
  weight: 1,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-02T00:00:00Z"),
  lastUsedAt: new Date("2026-10-02T00:00:00Z"),
};

beforeEach(() => {
  jest.clearAllMocks();
  (authenticateRequest as jest.Mock).mockResolvedValue({
    userId: "u1",
    workspace,
  });
});

describe("GET /api/ai/memories", () => {
  it("is off by default and lists what exists, without internals", async () => {
    (isLearningEnabled as jest.Mock).mockResolvedValue(false);
    (listAgentMemories as jest.Mock).mockResolvedValue([row]);
    const { status, body } = await call(GET, req("GET"));
    expect(status).toBe(200);
    expect(body.enabled).toBe(false);
    expect(body.memories).toEqual([
      {
        id: "m1",
        kind: "preference",
        content: "No meetings before 10",
        source: "chat",
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-02T00:00:00.000Z",
      },
    ]);
    expect(listAgentMemories).toHaveBeenCalledWith("u1", "ws-1");
  });

  it("passes the auth refusal through", async () => {
    (authenticateRequest as jest.Mock).mockResolvedValue({
      response: new Response("no", { status: 401 }),
    });
    expect((await GET(req("GET")))?.status).toBe(401);
  });
});

describe("PATCH /api/ai/memories", () => {
  it("turns learning on and starts a first pass in the background", async () => {
    const { status, body } = await call(PATCH, req("PATCH", { enabled: true }));
    expect(status).toBe(200);
    expect(body).toEqual({ enabled: true, deleted: 0 });
    expect(setLearningEnabled).toHaveBeenCalledWith("u1", true);
    expect(runLearning).toHaveBeenCalledWith("u1", workspace, {
      background: true,
    });
  });

  it("turns it off and keeps the memories by default", async () => {
    const { body } = await call(PATCH, req("PATCH", { enabled: false }));
    expect(body).toEqual({ enabled: false, deleted: 0 });
    expect(setLearningEnabled).toHaveBeenCalledWith("u1", false);
    expect(clearAllAgentMemories).not.toHaveBeenCalled();
    expect(runLearning).not.toHaveBeenCalled();
  });

  it("turns it off and deletes everything when asked", async () => {
    (clearAllAgentMemories as jest.Mock).mockResolvedValue({ count: 4 });
    const { body } = await call(
      PATCH,
      req("PATCH", { enabled: false, memories: "delete" })
    );
    expect(body).toEqual({ enabled: false, deleted: 4 });
    expect(clearAllAgentMemories).toHaveBeenCalledWith("u1");
  });

  it("edits one line", async () => {
    (updateMemoryForUser as jest.Mock).mockResolvedValue({
      ...row,
      content: "No meetings before 11",
    });
    const { status, body } = await call(
      PATCH,
      req("PATCH", { memoryId: "m1", content: "No meetings before 11" })
    );
    expect(status).toBe(200);
    expect(body.memory.content).toBe("No meetings before 11");
    expect(updateMemoryForUser).toHaveBeenCalledWith("u1", "ws-1", "m1", {
      content: "No meetings before 11",
      kind: undefined,
    });
  });

  it("answers 404 for another person's or a missing line", async () => {
    (updateMemoryForUser as jest.Mock).mockResolvedValue(null);
    const { status } = await call(
      PATCH,
      req("PATCH", { memoryId: "zzz", content: "Something else" })
    );
    expect(status).toBe(404);
  });

  it("refuses sensitive text and bad bodies", async () => {
    (updateMemoryForUser as jest.Mock).mockRejectedValue(
      new Error("Memories do not hold sensitive information")
    );
    const sensitive = await call(
      PATCH,
      req("PATCH", { memoryId: "m1", content: "my api key is abc" })
    );
    expect(sensitive.status).toBe(400);
    expect(sensitive.body.error).toBe("That cannot be saved as a memory.");
    expect((await call(PATCH, req("PATCH", { hello: 1 }))).status).toBe(400);
    expect((await call(PATCH, req("PATCH", { memoryId: "m1" }))).status).toBe(
      400
    );
    expect(setLearningEnabled).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/ai/memories", () => {
  it("deletes one memory in the workspace", async () => {
    (forgetForUser as jest.Mock).mockResolvedValue(true);
    const { body } = await call(DELETE, req("DELETE", { memoryId: "m1" }));
    expect(body).toEqual({ deleted: 1 });
    expect(forgetForUser).toHaveBeenCalledWith("u1", "ws-1", "m1");
  });

  it("forgets all", async () => {
    (clearAgentMemories as jest.Mock).mockResolvedValue({ count: 7 });
    const { body } = await call(DELETE, req("DELETE", { all: true }));
    expect(body).toEqual({ deleted: 7 });
    expect(clearAgentMemories).toHaveBeenCalledWith("u1", "ws-1");
  });

  it("needs a target", async () => {
    expect((await call(DELETE, req("DELETE", {}))).status).toBe(400);
  });
});
