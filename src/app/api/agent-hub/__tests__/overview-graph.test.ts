import { NextRequest, NextResponse } from "next/server";

import { GET } from "../overview/route";

const scope = { userId: "u1", workspaceId: "w1", actor: { kind: "owner" } };
jest.mock("@/services/agent-hub/http", () => ({
  authenticateHubOwner: jest.fn(async () => ({ scope })),
  hubRoute: (run: () => Promise<unknown>) => run(),
  queryOf: (request: NextRequest) => ({ params: request.nextUrl.searchParams }),
}));
jest.mock("@/services/agent-hub/agents", () => ({
  listAgentsForOwner: jest.fn(async () => []),
}));
jest.mock("@/services/agent-hub/items", () => ({
  listItems: jest.fn(async () => []),
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
});
