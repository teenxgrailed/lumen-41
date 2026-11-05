import { NextRequest, NextResponse } from "next/server";

import { GET } from "../overview/route";

const scope = { userId: "u1", workspaceId: "w1", actor: { kind: "owner" } };
jest.mock("@/services/agent-hub/http", () => ({
  authenticateHubOwner: jest.fn(async () => ({ scope })),
  hubRoute: (run: () => Promise<unknown>) => run(),
  queryOf: (request: NextRequest) => ({ params: request.nextUrl.searchParams }),
}));
const logError = jest.fn();
jest.mock("@/lib/logger", () => ({
  logger: { error: (...a: unknown[]) => logError(...a) },
}));
jest.mock("@/services/agent-hub/agents", () => ({
  listAgentsForOwner: jest.fn(async () => []),
}));
const listItems = jest.fn(async (): Promise<unknown[]> => []);
jest.mock("@/services/agent-hub/items", () => ({
  listItems: () => listItems(),
}));
const mediaStubs = jest.fn(
  async (_scope: unknown, ids: string[]) =>
    new Map(
      ids.map((id) => [
        id,
        [{ id: `f-${id}`, mime: "video/mp4", name: "a.mp4" }],
      ])
    )
);
jest.mock("@/services/agent-hub/attachments", () => ({
  mediaStubs: (...args: unknown[]) =>
    mediaStubs(...(args as [unknown, string[]])),
}));
jest.mock("@/services/agent-hub/notes", () => ({
  searchNotes: jest.fn(async () => ({ notes: [] })),
}));
jest.mock("@/services/agent-hub/reservations", () => ({
  listReservations: jest.fn(async () => ({ reservations: [] })),
}));
const mapGraph = jest.fn(async () => ({
  since: "2026-10-30T00:00:00.000Z",
  activity: { a1: [0, 0, 0, 0, 0, 0, 2] },
  threads: [],
  messagesThisWeek: 0,
}));
jest.mock("@/services/agent-hub/map-graph", () => ({
  mapGraph: (...args: unknown[]) => mapGraph(...(args as [])),
}));

const get = (query = "") =>
  GET(new NextRequest(`http://localhost/api/agent-hub/overview${query}`));

beforeEach(() => jest.clearAllMocks());

describe("GET /api/agent-hub/overview", () => {
  it("leaves the graph out unless it is asked for", async () => {
    const body = await ((await get()) as NextResponse).json();
    expect(body.graph).toBeUndefined();
    expect(mapGraph).not.toHaveBeenCalled();
  });

  it("adds the Map's graph in the same request with ?graph=1", async () => {
    const body = await ((await get("?graph=1")) as NextResponse).json();
    expect(mapGraph).toHaveBeenCalledWith(scope);
    expect(body.graph.activity.a1).toEqual([0, 0, 0, 0, 0, 0, 2]);
    expect(body.agents).toEqual([]);
  });

  it("gives items waiting on the owner their media stubs in one call", async () => {
    listItems.mockResolvedValueOnce([
      { id: "i1", status: "needs_owner" },
      { id: "i2", status: "in_progress" },
    ]);
    const body = await ((await get()) as NextResponse).json();
    expect(mediaStubs).toHaveBeenCalledTimes(1);
    expect(mediaStubs).toHaveBeenCalledWith(scope, ["i1"]);
    expect(body.items[0].media).toEqual([
      { id: "f-i1", mime: "video/mp4", name: "a.mp4" },
    ]);
    expect(body.items[1].media).toBeUndefined();
  });

  it("sends the whole overview with graph null when the graph fails", async () => {
    mapGraph.mockRejectedValueOnce(new Error("db down"));
    const res = (await get("?graph=1")) as NextResponse;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.graph).toBeNull();
    expect(body.agents).toEqual([]);
    expect(body.items).toEqual([]);
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining("Map graph failed"),
      expect.objectContaining({ error: "db down" }),
      "agent-hub-overview"
    );
  });
});
