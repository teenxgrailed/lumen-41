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
import { MCP_TOOLS } from "../tools";

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
    habit: { findMany: jest.fn(), findFirst: jest.fn() },
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
    scheduledBlocks: [
      {
        id: `b-${n}`,
        taskId: `task-${n}`,
        chunkIndex: 0,
        start: new Date("2026-11-24T09:00:00.000Z"),
        end: new Date("2026-11-24T09:30:00.000Z"),
        eventId: null,
        feedId: null,
        syncedAt: null,
      },
    ],
    lastTouchedAt: new Date("2026-11-22T10:00:00.000Z"),
    originPageId: null,
  };
}

/** Core fields that stay present as null, so a `=== null` check keeps working. */
const CORE_NULLABLE = new Set([
  "scheduledStart",
  "scheduledEnd",
  "dueDate",
  "completedAt",
  "projectId",
  "parentId",
  "status",
]);

function nullPaths(value: unknown, path = ""): string[] {
  if (value === null) return [path];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => nullPaths(v, `${path}[${i}]`));
  }
  if (typeof value === "object" && value) {
    return Object.entries(value).flatMap(([k, v]) =>
      v === null && CORE_NULLABLE.has(k) ? [] : nullPaths(v, `${path}.${k}`)
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
        key !== "isSample" &&
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

describe("compact(): review fixes", () => {
  it("keeps null core fields as null", () => {
    const row = compact({
      id: "t",
      title: "x",
      status: "todo",
      scheduledStart: null,
      scheduledEnd: null,
      dueDate: null,
      completedAt: null,
      projectId: null,
      parentId: null,
      description: null,
    });
    expect(row).toEqual({
      id: "t",
      title: "x",
      status: "todo",
      scheduledStart: null,
      scheduledEnd: null,
      dueDate: null,
      completedAt: null,
      projectId: null,
      parentId: null,
    });
  });

  it('keeps an empty block: content {} and "" survive, a null does not', () => {
    expect(
      compact({
        id: "b",
        type: "paragraph",
        position: 0,
        content: {},
        value: "",
        config: null,
      })
    ).toEqual({
      id: "b",
      type: "paragraph",
      position: 0,
      content: {},
      value: "",
    });
  });

  it("leaves task properties and event attendees / organizer alone", () => {
    const row = {
      id: "e",
      title: "Call",
      properties: { a: "", b: null, c: {} },
      attendees: [{ email: "a@b.c", name: "", status: null }],
      organizer: { email: "o@b.c", name: "" },
    };
    expect(compact(row)).toEqual(row);
    expect(compact({ id: "e", properties: null, organizer: null })).toEqual({
      id: "e",
    });
  });

  it("keeps lastTouchedAt and isSample:true, drops isSample:false", () => {
    const at = new Date("2026-11-22T10:00:00.000Z");
    const json = (v: unknown) => JSON.parse(JSON.stringify(v));
    expect(
      json(
        compact(
          { id: "a", isSample: true, lastTouchedAt: at },
          INTERNAL_TASK_KEYS
        )
      )
    ).toEqual({ id: "a", isSample: true, lastTouchedAt: at.toISOString() });
    expect(compact({ id: "a", isSample: false }, INTERNAL_TASK_KEYS)).toEqual({
      id: "a",
    });
    expect(INTERNAL_TASK_KEYS.has("isSample")).toBe(false);
    expect(INTERNAL_TASK_KEYS.has("lastTouchedAt")).toBe(false);
  });
});

/** One realistic row per object type: what must survive, and what must go. */
const PER_TYPE: Array<{
  type: string;
  row: Record<string, unknown>;
  survives: string[];
  gone: string[];
}> = [
  {
    type: "page",
    row: {
      id: "pg1",
      title: "Brief",
      icon: null,
      coverUrl: null,
      workspaceId: "workspace-1",
      isPrivate: false,
      isFavorite: false,
      parentId: null,
      blocks: [
        {
          id: "b1",
          type: "paragraph",
          content: {},
          position: 0,
          parentBlockId: null,
        },
      ],
      children: [],
      tags: [],
    },
    survives: ["id", "title", "workspaceId", "isPrivate", "parentId", "blocks"],
    gone: ["icon", "coverUrl", "children", "tags"],
  },
  {
    type: "event",
    row: {
      id: "ev1",
      title: "Standup",
      status: "confirmed",
      workspaceId: null,
      start: new Date("2026-11-24T09:00:00.000Z"),
      end: new Date("2026-11-24T09:15:00.000Z"),
      description: null,
      location: null,
      attendees: [],
      organizer: { email: "o@b.c" },
    },
    survives: [
      "id",
      "title",
      "status",
      "start",
      "end",
      "attendees",
      "organizer",
    ],
    gone: ["description", "location", "workspaceId"],
  },
  {
    type: "habit",
    row: {
      id: "h1",
      title: "Walk",
      status: "active",
      workspaceId: "workspace-1",
      userId: "user-1",
      description: null,
      archivedAt: null,
      isPrivate: false,
    },
    survives: ["id", "title", "status", "workspaceId", "isPrivate"],
    gone: ["description", "archivedAt"],
  },
  {
    type: "goal",
    row: {
      id: "g1",
      title: "Ship v2",
      status: "active",
      workspaceId: "workspace-1",
      progress: 0,
      targetValue: null,
      subgoals: [],
      checkIns: [],
    },
    survives: ["id", "title", "status", "workspaceId", "progress"],
    gone: ["targetValue", "subgoals", "checkIns"],
  },
  {
    type: "mail",
    row: {
      id: "m1",
      subject: "Hello",
      threadId: "th1",
      fromName: null,
      fromAddress: "a@b.c",
      isRead: false,
      labels: [],
      snoozedUntil: null,
    },
    survives: ["id", "subject", "threadId", "fromAddress", "isRead"],
    gone: ["fromName", "labels", "snoozedUntil"],
  },
  {
    type: "calendar",
    row: {
      id: "c1",
      name: "Work",
      enabled: true,
      workspaceId: null,
      color: null,
      syncError: null,
    },
    survives: ["id", "name", "enabled"],
    gone: ["workspaceId", "color", "syncError"],
  },
  {
    type: "agent-hub task",
    row: {
      id: "ht1",
      title: "Fix CI",
      status: "claimed",
      workspaceId: "workspace-1",
      isPrivate: false,
      assignee: null,
      doneCriteria: [],
      latestEvent: null,
      scheduledStart: null,
    },
    survives: [
      "id",
      "title",
      "status",
      "workspaceId",
      "isPrivate",
      "scheduledStart",
    ],
    gone: ["assignee", "doneCriteria", "latestEvent"],
  },
];

describe("compact(): one fixture per object type", () => {
  it.each(PER_TYPE)("$type keeps its identifying fields", (fixture) => {
    const out = compact(fixture.row) as Record<string, unknown>;
    const json = JSON.parse(JSON.stringify(out));
    for (const key of fixture.survives) {
      expect(json).toHaveProperty(key);
    }
    for (const key of fixture.gone) expect(json).not.toHaveProperty(key);
    for (const key of [
      "id",
      "title",
      "name",
      "status",
      "workspaceId",
      "isPrivate",
    ]) {
      if (fixture.row[key] !== undefined && fixture.row[key] !== null) {
        expect(json[key]).toEqual(JSON.parse(JSON.stringify(fixture.row[key])));
      }
    }
  });

  it("a page block with empty content is not pruned", () => {
    const page = PER_TYPE[0].row;
    const out = JSON.parse(JSON.stringify(compact(page)));
    expect(out.blocks[0]).toEqual({
      id: "b1",
      type: "paragraph",
      content: {},
      position: 0,
    });
  });
});

describe("MCP compact answers: route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authenticateBearer).mockResolvedValue(token);
    jest.mocked(resolveWorkspaceAccess).mockResolvedValue(shared);
  });

  it("needt_list keeps a non-null nextCursor and compacts the items", async () => {
    jest
      .mocked(prisma.task.findMany)
      .mockResolvedValue([taskRow(1), taskRow(2), taskRow(3)] as never);
    const { payload } = await call("needt_list", { type: "task", limit: 2 });
    expect(payload.items).toHaveLength(2);
    expect(payload.nextCursor).toBe("task-2");
    expect(nullPaths(payload.items)).toEqual([]);
  });

  it("needt_get task keeps scheduledBlocks, nulls dropped inside them", async () => {
    jest.mocked(prisma.task.findFirst).mockResolvedValue(taskRow(1) as never);
    const { payload } = await call("needt_get", { type: "task", id: "task-1" });
    expect(payload.scheduledBlocks).toEqual([
      {
        id: "b-1",
        taskId: "task-1",
        chunkIndex: 0,
        start: "2026-11-24T09:00:00.000Z",
        end: "2026-11-24T09:30:00.000Z",
      },
    ]);
    expect(payload.lastTouchedAt).toBe("2026-11-22T10:00:00.000Z");
    expect(payload).not.toHaveProperty("isSample");
    // core fields stay, as null
    expect(payload).toMatchObject({
      scheduledStart: null,
      scheduledEnd: null,
      dueDate: null,
      completedAt: null,
      projectId: null,
    });
  });

  it("needt_get habit goes through the same pass", async () => {
    jest.mocked(prisma.habit.findFirst).mockResolvedValue({
      id: "h1",
      title: "Walk",
      status: "active",
      workspaceId: "workspace-1",
      description: null,
    } as never);
    const { payload } = await call("needt_get", { type: "habit", id: "h1" });
    expect(payload).toEqual({
      id: "h1",
      title: "Walk",
      status: "active",
      workspaceId: "workspace-1",
    });
  });

  it("needt_search verbose:true returns the hits as they are", async () => {
    jest
      .mocked(searchWorkspace)
      .mockResolvedValue([
        { id: "t1", type: "task", title: "Write brief", subtitle: null },
      ] as never);
    const { payload } = await call("needt_search", {
      query: "brief",
      verbose: true,
    });
    expect(payload.results[0]).toHaveProperty("subtitle", null);
  });

  it("the descriptions and initialize instructions mention verbose", async () => {
    const byName = (name: string) => {
      const tool = MCP_TOOLS.find((t) => t.name === name);
      if (!tool) throw new Error(`no tool ${name}`);
      return tool;
    };
    for (const name of ["needt_get", "needt_list"]) {
      expect(byName(name).description).toContain("verbose: true");
    }
    expect(
      byName("needt_get").input.parse({ type: "task", id: "x", verbose: true })
    ).toMatchObject({ verbose: true });
    expect(
      byName("needt_list").input.parse({ type: "task", verbose: true })
    ).toMatchObject({ verbose: true });
    expect(
      byName("needt_search").input.parse({ query: "q", verbose: true })
    ).toMatchObject({ verbose: true });
    const init = await POST(
      new NextRequest("http://localhost/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer good-token",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "initialize",
          params: { protocolVersion: "2025-03-26" },
        }),
      })
    );
    const body = await init.json();
    expect(body.result.instructions).toContain("verbose: true");
  });
});
