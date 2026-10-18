import { undoAction } from "@/services/ops";
import { createFakePrisma } from "@/services/ops/__tests__/fake-prisma";
import { OWNER_ID, access } from "@/services/ops/__tests__/harness";

import { type AgentToolContext, getAgentTool } from "../agent/tools";

const mockState = { db: createFakePrisma() };

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
jest.mock("@/lib/entitlements", () => ({ getPlan: jest.fn() }));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn(),
  scheduleAllTasksForUserDetailed: jest.fn(),
}));
jest.mock("@/lib/auth/workspace-auth", () => {
  const actual = jest.requireActual("@/lib/auth/workspace-auth");
  return {
    ...actual,
    resolveWorkspaceAccess: jest.fn(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("@/services/ops/__tests__/harness").access();
    }),
  };
});

function context(): AgentToolContext {
  return {
    ai: {} as never,
    userId: OWNER_ID,
    workspace: access(),
    pageActor: { userId: OWNER_ID, workspace: access() },
    runId: async () => "run-1",
  };
}

beforeEach(() => {
  mockState.db = createFakePrisma();
});

describe("Ask and personal time", () => {
  it("offers the tools", () => {
    for (const name of [
      "create_personal_time",
      "mark_event_personal",
      "list_personal_time",
      "delete_personal_time",
    ]) {
      expect(getAgentTool(name)).toBeDefined();
    }
    expect(getAgentTool("delete_personal_time")?.kind).toBe("destructive");
  });

  it('"block Friday evening for a party" keeps the time, says so, and Undo takes it back', async () => {
    const tool = getAgentTool("create_personal_time")!;
    const outcome = await tool.run(
      context(),
      {
        kind: "party",
        start: "2026-10-23T19:00:00.000Z",
        end: "2026-10-23T23:00:00.000Z",
      },
      { confirmed: false }
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.summary).toBe("Kept time for “Party”");
    expect(outcome.changed).toBe(true);
    expect(outcome.action?.undoable).toBe(true);
    expect(mockState.db.tables.personalBlock).toHaveLength(1);

    const undone = await undoAction(outcome.action!.actionId, OWNER_ID);
    expect(undone.status).toBe("undone");
    expect(
      mockState.db.tables.personalBlock[0].archivedAt ?? null
    ).not.toBeNull();
  });

  it("asks before removing, and removes only on a yes", async () => {
    const create = getAgentTool("create_personal_time")!;
    const made = await create.run(
      context(),
      { kind: "lunch", start: "2026-10-23T12:00:00.000Z" },
      { confirmed: false }
    );
    const id = mockState.db.tables.personalBlock[0].id;
    expect(made.ok).toBe(true);

    const del = getAgentTool("delete_personal_time")!;
    const asked = await del.run(
      context(),
      { blockId: id },
      { confirmed: false }
    );
    expect(asked.confirm?.prompt).toContain("Lunch");
    expect(asked.changed).toBe(false);
    expect(mockState.db.tables.personalBlock[0].archivedAt ?? null).toBeNull();

    const done = await del.run(context(), { blockId: id }, { confirmed: true });
    expect(done.changed).toBe(true);
    expect(mockState.db.tables.personalBlock[0].archivedAt).toBeTruthy();
  });

  it("lists what is kept", async () => {
    const create = getAgentTool("create_personal_time")!;
    await create.run(
      context(),
      { kind: "walk", start: "2026-10-23T17:00:00.000Z" },
      { confirmed: false }
    );
    const list = getAgentTool("list_personal_time")!;
    const outcome = await list.run(context(), {}, { confirmed: false });
    expect(outcome.summary).toBe("Read 1 personal time block");
    expect(outcome.modelText).toContain("Walk");
  });
});
