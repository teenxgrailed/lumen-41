import { prisma } from "@/lib/prisma";
import { CalDAVFieldMapper } from "@/lib/task-sync/providers/caldav-field-mapper";
import {
  ExternalTask,
  TaskProviderInterface,
} from "@/lib/task-sync/providers/task-provider.interface";
import { TaskSyncManager } from "@/lib/task-sync/task-sync-manager";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    taskListMapping: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    task: {
      findMany: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    taskChange: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    scheduledBlock: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
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

const mockPrisma = prisma as unknown as {
  taskListMapping: { findUnique: jest.Mock; update: jest.Mock };
  task: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  taskChange: { findMany: jest.Mock };
  scheduledBlock: { deleteMany: jest.Mock };
  project: { findUnique: jest.Mock };
};

const WRITE_NOT_SUPPORTED = "CalDAV task write-back is not supported";

/**
 * A provider that reports it does not support write-back and throws on any
 * write call, mirroring the CalDAV import-only provider (GitHub issue #144).
 */
function makeImportOnlyProvider(
  externalTasks: ExternalTask[]
): TaskProviderInterface {
  return {
    getType: () => "CALDAV",
    getName: () => "CalDAV Tasks",
    supportsWriteBack: () => false,
    getTaskLists: jest.fn(),
    getTasks: jest.fn().mockResolvedValue(externalTasks),
    createTask: jest.fn().mockRejectedValue(new Error(WRITE_NOT_SUPPORTED)),
    updateTask: jest.fn().mockRejectedValue(new Error(WRITE_NOT_SUPPORTED)),
    deleteTask: jest.fn().mockRejectedValue(new Error(WRITE_NOT_SUPPORTED)),
    getChanges: jest.fn().mockResolvedValue([]),
    validateConnection: jest.fn().mockResolvedValue(true),
    mapToInternalTask: jest.fn(),
    mapToExternalTask: jest.fn(),
  } as unknown as TaskProviderInterface;
}

function mapping() {
  return {
    id: "map-1",
    providerId: "prov-1",
    projectId: "proj-1",
    externalListId: "https://dav.example.com/cal/tasks/",
    externalListName: "Tasks",
    isAutoScheduled: false,
    provider: { id: "prov-1", type: "CALDAV", userId: "user-1" },
  } as never;
}

describe("TaskSyncManager incoming-only sync for import-only providers (issue #144)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.task.create.mockResolvedValue({});
    mockPrisma.task.findFirst.mockResolvedValue(null);
    mockPrisma.taskListMapping.update.mockResolvedValue({});
  });

  it("imports a new external task without ever calling provider write methods", async () => {
    const external: ExternalTask = {
      id: "uid-1",
      title: "Buy milk",
      listId: "https://dav.example.com/cal/tasks/",
    };
    const provider = makeImportOnlyProvider([external]);

    // No local tasks yet for this project.
    mockPrisma.task.findMany.mockResolvedValue([]);

    const manager = new TaskSyncManager();
    jest.spyOn(manager, "getProvider").mockResolvedValue(provider);
    jest
      .spyOn(manager, "getFieldMapper")
      .mockReturnValue(new CalDAVFieldMapper());

    const result = await manager.syncTaskList(mapping());

    expect(result.success).toBe(true);
    expect(mockPrisma.task.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "workspace-1",
          assigneeId: "user-1",
        }),
      })
    );
    // Crucially: no write-back to the CalDAV server is attempted.
    expect(provider.createTask).not.toHaveBeenCalled();
    expect(provider.updateTask).not.toHaveBeenCalled();
    expect(provider.deleteTask).not.toHaveBeenCalled();
  });

  it("writes completedAt when importing an already-completed external task", async () => {
    const completed = new Date("2025-01-01T12:00:00.000Z");
    const external: ExternalTask = {
      id: "uid-1",
      title: "Finished thing",
      listId: "https://dav.example.com/cal/tasks/",
      status: "COMPLETED",
      completedDate: completed,
    };
    const provider = makeImportOnlyProvider([external]);

    mockPrisma.task.findMany.mockResolvedValue([]);

    const manager = new TaskSyncManager();
    jest.spyOn(manager, "getProvider").mockResolvedValue(provider);
    jest
      .spyOn(manager, "getFieldMapper")
      .mockReturnValue(new CalDAVFieldMapper());

    const result = await manager.syncTaskList(mapping());

    expect(result.success).toBe(true);
    expect(mockPrisma.task.create).toHaveBeenCalledTimes(1);
    const createArg = mockPrisma.task.create.mock.calls[0][0];
    expect(createArg.data.completedAt).toEqual(completed);
  });

  it("does NOT create a duplicate when the external task was already imported after the snapshot", async () => {
    const external: ExternalTask = {
      id: "uid-1",
      title: "Buy milk",
      listId: "https://dav.example.com/cal/tasks/",
    };
    const provider = makeImportOnlyProvider([external]);

    // Snapshot shows no local tasks, but a concurrent sync already created one,
    // so the pre-create existence check finds it.
    mockPrisma.task.findMany.mockResolvedValue([]);
    mockPrisma.task.findFirst.mockResolvedValue({ id: "race-1" });

    const manager = new TaskSyncManager();
    jest.spyOn(manager, "getProvider").mockResolvedValue(provider);
    jest
      .spyOn(manager, "getFieldMapper")
      .mockReturnValue(new CalDAVFieldMapper());

    const result = await manager.syncTaskList(mapping());

    expect(result.success).toBe(true);
    expect(mockPrisma.task.create).not.toHaveBeenCalled();
  });

  it("does not revive an archived task when the provider still returns it", async () => {
    const external: ExternalTask = {
      id: "uid-archived",
      title: "Still on provider",
      listId: "https://dav.example.com/cal/tasks/",
    };
    const provider = makeImportOnlyProvider([external]);
    mockPrisma.task.findMany.mockResolvedValue([
      {
        id: "local-archived",
        title: "Archived locally",
        externalTaskId: external.id,
        externalListId: "https://dav.example.com/cal/tasks/",
        source: "CALDAV",
        isArchived: true,
        tags: [],
        project: null,
      },
    ]);

    const manager = new TaskSyncManager();
    jest.spyOn(manager, "getProvider").mockResolvedValue(provider);
    jest
      .spyOn(manager, "getFieldMapper")
      .mockReturnValue(new CalDAVFieldMapper());

    const result = await manager.syncTaskList(mapping());

    expect(result.success).toBe(true);
    expect(mockPrisma.task.update).not.toHaveBeenCalled();
    expect(mockPrisma.task.create).not.toHaveBeenCalled();
  });

  it("does not update a same-UID task linked to another external list", async () => {
    const external: ExternalTask = {
      id: "shared-uid",
      title: "Task from the current collection",
      listId: "https://dav.example.com/cal/tasks/",
    };
    const provider = makeImportOnlyProvider([external]);
    mockPrisma.task.findMany.mockResolvedValue([
      {
        id: "other-list-task",
        title: "Task from another collection",
        externalTaskId: external.id,
        externalListId: "https://dav.example.com/cal/archive/",
        source: "CALDAV",
        isArchived: false,
        tags: [],
        project: null,
      },
    ]);

    const manager = new TaskSyncManager();
    jest.spyOn(manager, "getProvider").mockResolvedValue(provider);
    jest
      .spyOn(manager, "getFieldMapper")
      .mockReturnValue(new CalDAVFieldMapper());

    const result = await manager.syncTaskList(mapping());

    expect(result.success).toBe(true);
    expect(mockPrisma.task.update).not.toHaveBeenCalled();
    expect(mockPrisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          externalListId: "https://dav.example.com/cal/tasks/",
          externalTaskId: "shared-uid",
        }),
      })
    );
  });

  it("does NOT delete a locally-linked task that is missing from the external read", async () => {
    // External read returns NOTHING (e.g. a transient/partial failure).
    const provider = makeImportOnlyProvider([]);

    // A local task previously imported from CalDAV (linked by externalTaskId).
    mockPrisma.task.findMany.mockResolvedValue([
      {
        id: "local-1",
        title: "Previously imported",
        externalTaskId: "uid-1",
        source: "CALDAV",
        updatedAt: new Date(),
        tags: [],
        project: null,
      },
    ]);

    const manager = new TaskSyncManager();
    jest.spyOn(manager, "getProvider").mockResolvedValue(provider);
    jest
      .spyOn(manager, "getFieldMapper")
      .mockReturnValue(new CalDAVFieldMapper());

    const result = await manager.syncTaskList(mapping());

    expect(result.success).toBe(true);
    // The local task must NOT be deleted just because the external read was empty.
    expect(mockPrisma.task.delete).not.toHaveBeenCalled();
    // And no write-back was attempted.
    expect(provider.createTask).not.toHaveBeenCalled();
  });

  it("archives a linked task missing from a bidirectional provider", async () => {
    const provider = {
      ...makeImportOnlyProvider([]),
      supportsWriteBack: () => true,
      createTask: jest.fn(),
      updateTask: jest.fn(),
      deleteTask: jest.fn(),
    } as unknown as TaskProviderInterface;
    mockPrisma.task.findMany.mockResolvedValue([
      {
        id: "local-1",
        title: "Removed remotely",
        externalTaskId: "uid-1",
        externalListId: "https://dav.example.com/cal/tasks/",
        source: "CALDAV",
        isArchived: false,
        workspaceId: "workspace-1",
        updatedAt: new Date(0),
        tags: [],
        project: null,
      },
    ]);
    mockPrisma.taskChange.findMany.mockResolvedValue([]);

    const manager = new TaskSyncManager();
    jest.spyOn(manager, "getProvider").mockResolvedValue(provider);
    jest
      .spyOn(manager, "getFieldMapper")
      .mockReturnValue(new CalDAVFieldMapper());

    const result = await manager.syncTaskList(mapping());

    expect(result.success).toBe(true);
    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "local-1" },
        data: expect.objectContaining({
          isArchived: true,
          archivedAt: expect.any(Date),
        }),
      })
    );
    expect(provider.deleteTask).not.toHaveBeenCalled();
    expect(mockPrisma.task.delete).not.toHaveBeenCalled();
    expect(mockPrisma.scheduledBlock.deleteMany).toHaveBeenCalledWith({
      where: { taskId: "local-1", userId: "user-1" },
    });
  });
});

describe("TaskSyncManager health when every task failed", () => {
  it("marks the mapping ERROR instead of OK when all tasks failed", async () => {
    jest.clearAllMocks();
    mockPrisma.taskListMapping.update.mockResolvedValue({});
    const external: ExternalTask = {
      id: "uid-1",
      title: "Buy milk",
      listId: "https://dav.example.com/cal/tasks/",
    };
    const provider = makeImportOnlyProvider([external]);
    mockPrisma.task.findMany.mockResolvedValue([]);
    mockPrisma.task.findFirst.mockResolvedValue(null);
    mockPrisma.task.create.mockRejectedValue(new Error("db down"));

    const manager = new TaskSyncManager();
    jest.spyOn(manager, "getProvider").mockResolvedValue(provider);
    jest
      .spyOn(manager, "getFieldMapper")
      .mockReturnValue(new CalDAVFieldMapper());

    const result = await manager.syncTaskList(mapping());

    expect(result.success).toBe(false);
    const updates = mockPrisma.taskListMapping.update.mock.calls.map(
      (c) => c[0].data
    );
    expect(updates.some((d) => d.syncStatus === "OK")).toBe(false);
    expect(updates.some((d) => d.syncStatus === "ERROR")).toBe(true);
  });
});
