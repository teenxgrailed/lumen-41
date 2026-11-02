import { createGoogleOAuthClient } from "@/lib/google";
import { prisma } from "@/lib/prisma";
import {
  GoogleTaskProvider,
  getGoogleTasksClient,
} from "@/lib/task-sync/providers/google-provider";
import { TaskSyncManager } from "@/lib/task-sync/task-sync-manager";

const mockTokens = { getTokens: jest.fn(), refreshGoogleTokens: jest.fn() };

jest.mock("@/lib/token-manager", () => ({
  TokenManager: { getInstance: () => mockTokens },
}));
jest.mock("@/lib/google", () => ({ createGoogleOAuthClient: jest.fn() }));
jest.mock("googleapis", () => ({
  google: { tasks: jest.fn(() => ({ kind: "tasks-client" })) },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    taskListMapping: { update: jest.fn().mockResolvedValue({}) },
    task: {
      findMany: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn(),
    },
    taskChange: { findMany: jest.fn().mockResolvedValue([]) },
    project: {
      findUnique: jest.fn().mockResolvedValue({ workspaceId: "workspace-1" }),
    },
  },
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const db = prisma as unknown as {
  task: {
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

const SAMPLE = [
  {
    id: "t1",
    title: "Buy milk",
    notes: "2 litres",
    status: "needsAction",
    due: "2026-11-05T00:00:00.000Z",
    updated: "2026-11-01T10:00:00.000Z",
  },
  {
    id: "t2",
    title: "File taxes",
    status: "completed",
    completed: "2026-11-01T09:00:00.000Z",
    updated: "2026-11-01T09:00:00.000Z",
  },
];

function fakeClient(items: unknown[] = SAMPLE) {
  return {
    tasklists: {
      list: jest.fn().mockResolvedValue({
        data: { items: [{ id: "list-1", title: "Groceries" }] },
      }),
    },
    tasks: {
      list: jest.fn().mockResolvedValue({ data: { items } }),
      insert: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    },
  };
}

function mapping() {
  return {
    id: "map-1",
    providerId: "prov-1",
    projectId: "proj-1",
    externalListId: "list-1",
    externalListName: "Groceries",
    isAutoScheduled: false,
    provider: { id: "prov-1", type: "GOOGLE", userId: "user-1" },
  } as never;
}

function managerWith(client: ReturnType<typeof fakeClient>) {
  const manager = new TaskSyncManager();
  jest
    .spyOn(manager, "getProvider")
    .mockResolvedValue(
      new GoogleTaskProvider(client as never, "acct-1", "user-1")
    );
  return manager;
}

beforeEach(() => {
  jest.clearAllMocks();
  db.task.findMany.mockResolvedValue([]);
  db.task.create.mockResolvedValue({});
  db.task.update.mockResolvedValue({});
});

describe("Google Tasks provider", () => {
  it("lists the task lists of the account", async () => {
    const provider = new GoogleTaskProvider(
      fakeClient() as never,
      "acct-1",
      "user-1"
    );
    await expect(provider.getTaskLists()).resolves.toEqual([
      { id: "list-1", name: "Groceries", isDefault: false },
    ]);
  });

  it("asks for completed and hidden tasks, so a task finished in Google's own apps syncs", async () => {
    const client = fakeClient();
    await new GoogleTaskProvider(client as never, "acct-1", "user-1").getTasks(
      "list-1"
    );
    expect(client.tasks.list).toHaveBeenCalledWith(
      expect.objectContaining({
        tasklist: "list-1",
        showCompleted: true,
        showHidden: true,
      })
    );
  });

  it("imports one way: it never writes to Google", () => {
    expect(
      new GoogleTaskProvider(
        {} as never,
        "acct-1",
        "user-1"
      ).supportsWriteBack()
    ).toBe(false);
  });
});

describe("Google Tasks first sync", () => {
  it("imports title, notes, due date and done state into the chosen project", async () => {
    const client = fakeClient();
    const result = await managerWith(client).syncTaskList(mapping());

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        imported: 2,
        direction: "incoming",
      })
    );
    expect(db.task.create).toHaveBeenCalledTimes(2);
    const [open, done] = db.task.create.mock.calls.map(([arg]) => arg.data);

    expect(open).toEqual(
      expect.objectContaining({
        title: "Buy milk",
        description: "2 litres",
        status: "todo",
        dueDate: new Date("2026-11-05T00:00:00.000Z"),
        completedAt: null,
        source: "GOOGLE",
        externalListId: "list-1",
        externalTaskId: "t1",
        projectId: "proj-1",
        userId: "user-1",
      })
    );
    // Google's due date is the due date; the start date is Needt's own.
    expect(open.startDate).toBeUndefined();

    expect(done).toEqual(
      expect.objectContaining({
        title: "File taxes",
        status: "completed",
        completedAt: new Date("2026-11-01T09:00:00.000Z"),
        externalTaskId: "t2",
      })
    );
  });

  it("never pushes to Google or deletes anything there", async () => {
    const client = fakeClient();
    db.task.findMany.mockResolvedValue([
      // a task of the project that Google has never seen
      { id: "mine", title: "Only in Needt", source: null, tags: [] },
    ]);
    await managerWith(client).syncTaskList(mapping());
    expect(client.tasks.insert).not.toHaveBeenCalled();
    expect(client.tasks.patch).not.toHaveBeenCalled();
    expect(client.tasks.delete).not.toHaveBeenCalled();
  });
});

describe("Google Tasks re-sync (selective field sync)", () => {
  const local = {
    id: "local-1",
    title: "Old title",
    description: "old notes",
    status: "todo",
    dueDate: new Date("2026-10-01T00:00:00.000Z"),
    completedAt: null,
    // owned by Needt
    startDate: new Date("2026-10-30T08:00:00.000Z"),
    duration: 45,
    priority: "high",
    energyLevel: "high",
    preferredTime: "morning",
    isAutoScheduled: true,
    scheduleLocked: true,
    scheduledStart: new Date("2026-10-30T08:00:00.000Z"),
    source: "GOOGLE",
    externalListId: "list-1",
    externalTaskId: "t1",
    isArchived: false,
    tags: [],
    project: null,
  };

  const update = () => db.task.update.mock.calls[0][0].data;

  it("overwrites what Google owns and keeps what Needt owns", async () => {
    db.task.findMany.mockResolvedValue([local]);
    const client = fakeClient([
      {
        id: "t1",
        title: "New title",
        notes: "new notes",
        status: "completed",
        completed: "2026-11-02T08:00:00.000Z",
        due: "2026-11-09T00:00:00.000Z",
        updated: "2026-11-02T08:00:00.000Z",
      },
    ]);
    await managerWith(client).syncTaskList(mapping());

    expect(db.task.create).not.toHaveBeenCalled();
    const data = update();
    expect(data).toEqual(
      expect.objectContaining({
        title: "New title",
        description: "new notes",
        status: "completed",
        dueDate: new Date("2026-11-09T00:00:00.000Z"),
        completedAt: new Date("2026-11-02T08:00:00.000Z"),
      })
    );
    expect(data).toEqual(
      expect.objectContaining({
        startDate: local.startDate,
        duration: 45,
        priority: "high",
        energyLevel: "high",
        preferredTime: "morning",
        isAutoScheduled: true,
        scheduleLocked: true,
        scheduledStart: local.scheduledStart,
      })
    );
  });

  it("clears notes and due date removed in Google, and reopens a task", async () => {
    db.task.findMany.mockResolvedValue([
      { ...local, status: "completed", completedAt: new Date("2026-11-01") },
    ]);
    const client = fakeClient([
      { id: "t1", title: "Old title", status: "needsAction" },
    ]);
    await managerWith(client).syncTaskList(mapping());

    expect(update()).toEqual(
      expect.objectContaining({
        description: null,
        dueDate: null,
        status: "todo",
        completedAt: null,
        startDate: local.startDate,
        priority: "high",
      })
    );
  });

  it("leaves a task that disappeared from Google alone", async () => {
    db.task.findMany.mockResolvedValue([local]);
    await managerWith(fakeClient([])).syncTaskList(mapping());
    expect(db.task.delete).not.toHaveBeenCalled();
    expect(db.task.update).not.toHaveBeenCalled();
  });
});

describe("Google Tasks token refresh", () => {
  const oauthClient = { setCredentials: jest.fn() };

  beforeEach(() => {
    (createGoogleOAuthClient as jest.Mock).mockResolvedValue(oauthClient);
  });

  it("refreshes through the token manager when the token is about to expire", async () => {
    mockTokens.getTokens.mockResolvedValue({
      accessToken: "old",
      refreshToken: "rt",
      expiresAt: new Date(Date.now() + 60_000),
    });
    mockTokens.refreshGoogleTokens.mockResolvedValue({
      accessToken: "fresh",
      refreshToken: "rt",
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    await getGoogleTasksClient("acct-1", "user-1");

    expect(mockTokens.refreshGoogleTokens).toHaveBeenCalledWith(
      "acct-1",
      "user-1"
    );
    expect(oauthClient.setCredentials).toHaveBeenCalledWith({
      access_token: "fresh",
      refresh_token: "rt",
    });
  });

  it("keeps a token that is still good", async () => {
    mockTokens.getTokens.mockResolvedValue({
      accessToken: "good",
      refreshToken: "rt",
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    await getGoogleTasksClient("acct-1", "user-1");

    expect(mockTokens.refreshGoogleTokens).not.toHaveBeenCalled();
    expect(oauthClient.setCredentials).toHaveBeenCalledWith({
      access_token: "good",
      refresh_token: "rt",
    });
  });

  it("fails clearly when the account has no tokens", async () => {
    mockTokens.getTokens.mockResolvedValue(null);
    await expect(getGoogleTasksClient("acct-1", "user-1")).rejects.toThrow(
      "No tokens found for account"
    );
  });
});
