import { NextRequest } from "next/server";

import { POST } from "@/app/api/mcp/route";
import {
  type BearerAuth,
  authenticateBearer,
} from "@/services/connectors/bearer";
import { searchWorkspace } from "@/services/search/workspace-search";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { resolveWorkspaceAccess } from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

import { INTERNAL_TASK_KEYS, compact, compactPage } from "../compact";

jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn(),
  publishRealtimeEventSafe: jest.fn(),
}));
jest.mock("@/services/connectors/bearer", () => ({
  ...jest.requireActual("@/services/connectors/bearer"),
  authenticateBearer: jest.fn(),
}));
jest.mock("@/lib/auth/workspace-auth", () => ({
  ...jest.requireActual("@/lib/auth/workspace-auth"),
  resolveWorkspaceAccess: jest.fn(),
}));
jest.mock("@/lib/auth/email-verification-access", () => ({
  getEmailVerificationStatus: jest
    .fn()
    .mockResolvedValue({ required: false, verified: true }),
}));
jest.mock("@/services/search/workspace-search", () => ({
  ...jest.requireActual("@/services/search/workspace-search"),
  searchWorkspace: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimits: jest.fn().mockResolvedValue(null),
  ipRule: jest.fn(),
  accountRule: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findMany: jest.fn(), findFirst: jest.fn() },
    project: { findMany: jest.fn(), findFirst: jest.fn() },
  },
}));

const shared = {
  enabled: true,
  workspaceId: "workspace-1",
  workspaceKind: WorkspaceKind.SHARED,
  role: WorkspaceRole.EDITOR,
  dataScope: { mode: "workspace" as const, workspaceId: "workspace-1" },
};

const token: BearerAuth = {
  userId: "user-1",
  kind: "personal",
  scopes: ["needt.read", "needt.write"],
};

async function call(name: string, args: Record<string, unknown>) {
  const response = await POST(
    new NextRequest("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer good-token",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    })
  );
  const body = await response.json();
  const text: string = body.result.content[0].text;
  return { text, payload: JSON.parse(text), isError: body.result.isError };
}

/** A task row the way Prisma returns it: every column present, most null. */
function taskRow(n: number) {
  const nulls = [
    "description",
    "icon",
    "dueDate",
    "startDate",
    "duration",
    "priority",
    "energyLevel",
    "preferredTime",
    "estOptimistic",
    "estLikely",
    "estPessimistic",
    "actualMinutes",
    "estimateDelta",
    "optimisticDelta",
    "likelyDelta",
    "pessimisticDelta",
    "minChunkMinutes",
    "maxChunkMinutes",
    "deadline",
    "contextTag",
    "dependsOnId",
    "scheduledStart",
    "scheduledEnd",
    "scheduleId",
    "scheduleScore",
    "lastScheduled",
    "availableFrom",
    "postponedUntil",
    "archivedAt",
    "blockEventId",
    "blockFeedId",
    "recurrenceRule",
    "lastCompletedDate",
    "completedAt",
    "recurrenceMasterId",
    "recurrenceInstanceAt",
    "externalTaskId",
    "source",
    "lastSyncedAt",
    "externalListId",
    "externalCreatedAt",
    "externalUpdatedAt",
    "syncStatus",
    "syncError",
    "syncHash",
    "habitId",
    "habitOccurrenceAt",
    "assigneeId",
    "stageId",
    "projectId",
    "boardId",
    "boardColumnId",
    "boardPosition",
    "properties",
    "ideaCheckedAt",
    "ideaLastShownAt",
    "trashedAt",
    "originKind",
    "originId",
  ];
  return {
    id: `task-${n}`,
    title: `Task ${n}`,
    status: "todo",
    energyRequired: "MEDIUM",
    estimatedMinutes: 30,
    actualFocusedMinutes: 0,
    hardDeadline: false,
    priorityLevel: "HIGH",
    isFrozen: false,
    autoScheduled: false,
    isAutoScheduled: true,
    scheduleLocked: false,
    scheduleAtRisk: false,
    isArchived: false,
    blockDirty: false,
    isRecurring: false,
    skipSync: false,
    isSample: false,
    ideaSkipCount: 0,
    userId: "user-1",
    workspaceId: "workspace-1",
    createdAt: new Date("2026-11-20T10:00:00.000Z"),
    updatedAt: new Date("2026-11-21T10:00:00.000Z"),
    ...Object.fromEntries(nulls.map((key) => [key, null])),
    parts: [
      { id: `p-${n}`, title: "Step", done: false, position: 0 },
      { id: `q-${n}`, title: "Close", done: true, position: 1 },
    ],
    tags: [],
    attachments: [],
    originPageId: null,
  };
}

function nullPaths(value: unknown, path = ""): string[] {
  if (value === null) return [path];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => nullPaths(v, `${path}[${i}]`));
  }
  if (typeof value === "object" && value) {
    return Object.entries(value).flatMap(([k, v]) =>
      nullPaths(v, `${path}.${k}`)
    );
  }
  return [];
}

describe("compact()", () => {
  it("drops null, undefined, empty string, empty array and empty object", () => {
    expect(
      compact({
        id: "a",
        a: null,
        b: undefined,
        c: "",
        d: [],
        e: {},
        f: "keep",
      })
    ).toEqual({ id: "a", f: "keep" });
  });

  it("keeps false and 0", () => {
    expect(compact({ id: "a", pinned: false, count: 0, done: false })).toEqual({
      id: "a",
      pinned: false,
      count: 0,
      done: false,
    });
  });

  it("keeps the required keys even when empty", () => {
    expect(
      compact({
        id: "a",
        title: "",
        name: null,
        status: null,
        position: 0,
        kind: null,
        type: null,
        done: false,
      })
    ).toEqual({
      id: "a",
      title: "",
      name: null,
      status: null,
      position: 0,
      kind: null,
      type: null,
      done: false,
    });
  });

  it("serializes dates instead of dropping them as empty objects", () => {
    const at = new Date("2026-11-20T10:00:00.000Z");
    expect(JSON.parse(JSON.stringify(compact({ id: "a", at })))).toEqual({
      id: "a",
      at: at.toISOString(),
    });
  });

  it("reaches into nested items and arrays", () => {
    expect(
      compact({
        id: "a",
        parts: [{ id: "p", title: "s", done: false, position: 0, x: null }],
      })
    ).toEqual({
      id: "a",
      parts: [{ id: "p", title: "s", done: false, position: 0 }],
    });
  });

  it("leaves person-written content alone", () => {
    const block = {
      id: "b",
      type: "paragraph",
      content: { text: "", a: null },
    };
    expect(compact(block)).toEqual(block);
  });

  it("drops the internal list only when asked", () => {
    const row = { id: "a", scheduleScore: 3, syncHash: "x", title: "t" };
    expect(compact(row)).toEqual(row);
    expect(compact(row, INTERNAL_TASK_KEYS)).toEqual({ id: "a", title: "t" });
  });

  it("keeps the list envelope, a null nextCursor included", () => {
    expect(
      compactPage({ items: [{ id: "a", x: null }], nextCursor: null })
    ).toEqual({ items: [{ id: "a" }], nextCursor: null });
  });
});

describe("MCP compact answers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authenticateBearer).mockResolvedValue(token);
    jest.mocked(resolveWorkspaceAccess).mockResolvedValue(shared);
    jest
      .mocked(prisma.task.findMany)
      .mockResolvedValue([taskRow(1), taskRow(2)] as never);
    jest.mocked(prisma.task.findFirst).mockResolvedValue(taskRow(1) as never);
  });

  it("needt_list: no nulls in the default items, required keys present", async () => {
    const { payload, text } = await call("needt_list", { type: "task" });
    expect(payload.items).toHaveLength(2);
    expect(nullPaths(payload.items)).toEqual([]);
    for (const item of payload.items) {
      expect(item).toMatchObject({
        id: expect.any(String),
        title: expect.any(String),
        status: "todo",
      });
      expect(item.parts[0]).toEqual({
        id: expect.any(String),
        title: "Step",
        done: false,
        position: 0,
      });
      // meaningful false / 0 survive
      expect(item).toMatchObject({ isFrozen: false, actualFocusedMinutes: 0 });
      // internal columns are gone
      for (const key of INTERNAL_TASK_KEYS)
        expect(item).not.toHaveProperty(key);
    }
    expect(payload.nextCursor).toBeNull();
    expect(text).not.toContain("\n");
  });

  it("needt_list: keeps every non-empty column the old answer had", async () => {
    const row = taskRow(1);
    const { payload } = await call("needt_list", { type: "task" });
    const full = Object.entries(row).filter(
      ([key, value]) =>
        !INTERNAL_TASK_KEYS.has(key) &&
        !(value === null || (Array.isArray(value) && value.length === 0))
    );
    for (const [key] of full) expect(payload.items[0]).toHaveProperty(key);
  });

  it("needt_list verbose:true returns the full shape", async () => {
    const { payload } = await call("needt_list", {
      type: "task",
      verbose: true,
    });
    const item = payload.items[0];
    expect(item).toHaveProperty("description", null);
    expect(item).toHaveProperty("scheduleScore", null);
    expect(item).toHaveProperty("syncHash", null);
    expect(item).toHaveProperty("tags", []);
    expect(Object.keys(item)).toEqual(
      Object.keys(JSON.parse(JSON.stringify(taskRow(1))))
    );
  });

  it("needt_get: compact by default, full with verbose", async () => {
    const compactAnswer = await call("needt_get", {
      type: "task",
      id: "task-1",
    });
    const full = await call("needt_get", {
      type: "task",
      id: "task-1",
      verbose: true,
    });
    expect(nullPaths(compactAnswer.payload)).toEqual([]);
    expect(compactAnswer.payload).toMatchObject({
      id: "task-1",
      title: "Task 1",
      status: "todo",
    });
    expect(compactAnswer.text.length).toBeLessThan(full.text.length / 2);
    expect(nullPaths(full.payload).length).toBeGreaterThan(40);
    expect(Object.keys(full.payload)).toEqual(
      Object.keys(JSON.parse(JSON.stringify(taskRow(1))))
    );
  });

  it("needt_get / needt_list on other types: nulls dropped, id and name kept", async () => {
    const project = {
      id: "project-1",
      name: "Launch",
      status: "active",
      description: null,
      color: null,
      userId: "user-1",
      workspaceId: "workspace-1",
      createdAt: new Date("2026-11-01T00:00:00.000Z"),
    };
    jest.mocked(prisma.project.findFirst).mockResolvedValue(project as never);
    jest.mocked(prisma.project.findMany).mockResolvedValue([project] as never);
    const got = await call("needt_get", { type: "project", id: "project-1" });
    expect(got.payload).toEqual({
      id: "project-1",
      name: "Launch",
      status: "active",
      userId: "user-1",
      workspaceId: "workspace-1",
      createdAt: "2026-11-01T00:00:00.000Z",
    });
    const listed = await call("needt_list", { type: "project" });
    expect(listed.payload.items[0]).toEqual(got.payload);
    const verbose = await call("needt_list", {
      type: "project",
      verbose: true,
    });
    expect(verbose.payload.items[0]).toHaveProperty("description", null);
  });

  it("needt_get: a missing object is still a 404 error", async () => {
    jest.mocked(prisma.task.findFirst).mockResolvedValue(null as never);
    const { payload, isError } = await call("needt_get", {
      type: "task",
      id: "nope",
    });
    expect(isError).toBe(true);
    expect(payload).toEqual({ status: 404, error: "task not found" });
  });

  it("needt_search: hits keep id, type and title, no nulls", async () => {
    jest
      .mocked(searchWorkspace)
      .mockResolvedValue([
        { id: "t1", type: "task", title: "Write brief", subtitle: null },
      ] as never);
    const { payload, text } = await call("needt_search", { query: "brief" });
    expect(payload.results).toEqual([
      { id: "t1", type: "task", title: "Write brief" },
    ]);
    expect(text).not.toContain("\n");
  });
});
