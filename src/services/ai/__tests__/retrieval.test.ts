import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

import { runAgentToolCall } from "../agent/loop";
import { fetchObject, hrefFor, searchData, snippetAround } from "../retrieval";

jest.mock("@/lib/prisma", () => {
  const model = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
  });
  return {
    prisma: {
      task: model(),
      project: model(),
      calendarEvent: model(),
      page: model(),
      habit: model(),
      mailMessage: model(),
      moodboardItem: model(),
      $queryRaw: jest.fn().mockResolvedValue([]),
    },
  };
});
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/services/pages/page-service", () => ({
  listPages: jest.fn().mockResolvedValue([]),
  getPage: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/services/moodboards/moodboard-service", () => ({
  listMoodboards: jest.fn().mockResolvedValue([]),
  getMoodboard: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/services/pages/page-model", () => ({
  pageActorScope: jest.fn(() => ({ ACCESSIBLE: true })),
}));
jest.mock("../agent/legacy-tools", () => ({ executeTool: jest.fn() }));
jest.mock("@/lib/entitlements", () => ({ canPlanMyDay: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pageService = require("@/services/pages/page-service");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const boardService = require("@/services/moodboards/moodboard-service");

const workspace = (
  kind: WorkspaceKind = WorkspaceKind.PERSONAL
): WorkspaceAccess => ({
  enabled: true,
  workspaceId: "ws-1",
  workspaceKind: kind,
  role: WorkspaceRole.OWNER,
  dataScope: { mode: "workspace", workspaceId: "ws-1" },
});

const db = prisma as unknown as Record<
  string,
  Record<string, jest.Mock> & jest.Mock
>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("searchData", () => {
  it("scopes every source to the person's workspace and access", async () => {
    await searchData({ userId: "u1", workspace: workspace(), query: "tax" });

    expect(db.task.findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId: "ws-1",
      isArchived: false,
    });
    expect(db.project.findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId: "ws-1",
    });
    expect(db.habit.findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId: "ws-1",
      userId: "u1",
    });
    expect(db.calendarEvent.findMany.mock.calls[0][0].where).toMatchObject({
      feed: { userId: "u1", enabled: true },
    });
    expect(db.mailMessage.findMany.mock.calls[0][0].where).toMatchObject({
      account: { userId: "u1" },
    });
    // pages go through page access, not a bare query
    expect(pageService.listPages).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1" }),
      { search: "tax" }
    );
    expect(db.page.findMany.mock.calls[0][0].where).toMatchObject({
      ACCESSIBLE: true,
      trashedAt: null,
    });
    expect(boardService.listMoodboards).toHaveBeenCalled();
  });

  it("never selects a mail body", async () => {
    await searchData({
      userId: "u1",
      workspace: workspace(),
      query: "invoice",
      types: ["mail"],
    });
    const select = db.mailMessage.findMany.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual([
      "date",
      "fromAddress",
      "fromName",
      "id",
      "snippet",
      "subject",
    ]);
    expect(select).not.toHaveProperty("bodyHtml");
    expect(select).not.toHaveProperty("bodyText");
  });

  it("does not search events in a shared workspace", async () => {
    await searchData({
      userId: "u1",
      workspace: workspace(WorkspaceKind.SHARED),
      query: "x",
      types: ["event"],
    });
    expect(db.calendarEvent.findMany).not.toHaveBeenCalled();
  });

  it("searches page text only inside the pages the person can open", async () => {
    db.page.findMany.mockResolvedValueOnce([{ id: "p1" }, { id: "p2" }]);
    db.$queryRaw.mockResolvedValueOnce([
      { pageId: "p2", text: "Remember the passport before the trip to Lviv." },
    ]);
    pageService.listPages.mockResolvedValueOnce([
      { id: "p1", title: "Trip plan" },
    ]);
    db.page.findFirst.mockResolvedValueOnce({ title: "Packing" });

    const hits = await searchData({
      userId: "u1",
      workspace: workspace(),
      query: "passport",
      types: ["page"],
    });

    const sql = db.$queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(sql.values).toContainEqual(["p1", "p2"]);
    expect(hits.map((hit) => [hit.id, hit.title])).toEqual([
      ["p1", "Trip plan"],
      ["p2", "Packing"],
    ]);
    expect(hits[1].snippet).toContain("passport");
    expect(hits[1].href).toBe("/pages/p2");
  });

  it("finds a moodboard by a caption on it, but only among boards it can list", async () => {
    boardService.listMoodboards.mockResolvedValueOnce([
      { id: "b1", title: "Kitchen" },
      { id: "b2", title: "Garden" },
    ]);
    db.moodboardItem.findMany.mockResolvedValueOnce([
      { moodboardId: "b2", title: "terracotta pots", text: null },
    ]);
    const hits = await searchData({
      userId: "u1",
      workspace: workspace(),
      query: "terracotta",
      types: ["moodboard"],
    });
    expect(
      db.moodboardItem.findMany.mock.calls[0][0].where.moodboardId
    ).toEqual({ in: ["b1", "b2"] });
    expect(hits).toEqual([
      expect.objectContaining({
        type: "moodboard",
        id: "b2",
        title: "Garden",
        href: "/moodboards/b2",
      }),
    ]);
  });

  it("returns nothing for an empty query and caps the limit", async () => {
    expect(
      await searchData({ userId: "u1", workspace: workspace(), query: "  " })
    ).toEqual([]);
    await searchData({
      userId: "u1",
      workspace: workspace(),
      query: "a",
      types: ["task"],
      limit: 500,
    });
    expect(db.task.findMany.mock.calls[0][0].take).toBe(15);
  });
});

describe("fetchObject", () => {
  it("is null for something outside the person's scope", async () => {
    expect(
      await fetchObject({
        userId: "u1",
        workspace: workspace(),
        type: "task",
        id: "other",
      })
    ).toBeNull();
    expect(db.task.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "other",
      workspaceId: "ws-1",
    });
  });

  it("reads a page's text, truncated, with its link", async () => {
    pageService.getPage.mockResolvedValueOnce({
      id: "p1",
      title: "Notes",
      updatedAt: new Date("2026-10-01T00:00:00Z"),
      blocks: [
        { content: { text: "First" } },
        { content: { text: "x".repeat(9000) } },
        { content: { url: "no text here" } },
      ],
    });
    const found = await fetchObject({
      userId: "u1",
      workspace: workspace(),
      type: "page",
      id: "p1",
    });
    expect(found?.href).toBe("/pages/p1");
    const text = found?.data.text as string;
    expect(text.startsWith("First\n")).toBe(true);
    expect(text.length).toBeLessThan(3600);
  });

  it("reads mail as metadata, never a body", async () => {
    db.mailMessage.findFirst.mockResolvedValueOnce({
      subject: "Invoice 42",
      fromName: "Acme",
      fromAddress: "a@acme.test",
      date: new Date("2026-10-02T10:00:00Z"),
      snippet: "Please find attached",
      isRead: false,
      labels: ["INBOX"],
    });
    const found = await fetchObject({
      userId: "u1",
      workspace: workspace(),
      type: "mail",
      id: "m1",
    });
    expect(found?.data).toMatchObject({ from: "Acme", unread: true });
    const select = db.mailMessage.findFirst.mock.calls[0][0].select;
    expect(select).not.toHaveProperty("bodyHtml");
    expect(select).not.toHaveProperty("bodyText");
    expect(db.mailMessage.findFirst.mock.calls[0][0].where).toMatchObject({
      account: { userId: "u1" },
    });
  });
});

describe("agent search and get tools", () => {
  const ctx = {
    ai: {} as never,
    userId: "u1",
    workspace: workspace(),
    pageActor: "u1" as never,
    runId: async () => "run",
  };
  const options = {
    confirmed: false,
    settings: { allowParseTasks: true, allowFullAuto: true },
  };

  it("search returns hits with links and no sources; get cites what it read", async () => {
    db.task.findMany.mockResolvedValueOnce([
      {
        id: "t1",
        title: "File taxes",
        status: "todo",
        dueDate: null,
        description: null,
      },
    ]);
    const found = await runAgentToolCall(
      ctx,
      "search",
      { query: "tax" },
      options
    );
    expect(found.ok).toBe(true);
    expect(JSON.parse(found.modelText).hits[0]).toMatchObject({
      type: "task",
      id: "t1",
      href: "/tasks?taskId=t1",
    });
    expect(found.sources).toBeUndefined();

    db.task.findFirst.mockResolvedValueOnce({
      id: "t1",
      title: "File taxes",
      status: "todo",
      description: "Do it",
      parts: [],
      project: null,
      dueDate: null,
      deadline: null,
      priorityLevel: "HIGH",
      estimatedMinutes: 60,
      scheduledStart: null,
      scheduledEnd: null,
      entry: null,
      dependsOnId: null,
      isArchived: false,
    });
    const got = await runAgentToolCall(
      ctx,
      "get",
      { type: "task", id: "t1" },
      options
    );
    expect(got.sources).toEqual([
      { type: "task", id: "t1", title: "File taxes", href: "/tasks?taskId=t1" },
    ]);
    expect(JSON.parse(got.modelText)).toMatchObject({ priority: "HIGH" });
  });

  it("get says so when the object is not theirs", async () => {
    const got = await runAgentToolCall(
      ctx,
      "get",
      { type: "page", id: "x" },
      options
    );
    expect(got.ok).toBe(false);
  });

  it("keeps a long result small", async () => {
    db.task.findMany.mockResolvedValueOnce(
      Array.from({ length: 15 }, (_, i) => ({
        id: `t${i}`,
        title: `Task ${i}`,
        status: "todo",
        dueDate: null,
        description: "word ".repeat(400),
      }))
    );
    const found = await runAgentToolCall(
      ctx,
      "search",
      { query: "word" },
      options
    );
    expect(found.modelText.length).toBeLessThan(6100);
  });
});

describe("helpers", () => {
  it("builds links the app opens", () => {
    expect(hrefFor("task", "a b")).toBe("/tasks?taskId=a%20b");
    expect(hrefFor("habit", "h")).toBe("/habits");
  });
  it("cuts a snippet around the match", () => {
    const text = `${"a ".repeat(200)}needle${" b".repeat(200)}`;
    const snippet = snippetAround(text, "needle");
    expect(snippet).toContain("needle");
    expect(snippet.length).toBeLessThan(180);
    expect(snippetAround("short", "x")).toBe("short");
  });
});
