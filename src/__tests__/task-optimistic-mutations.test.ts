import {
  beginTaskMutation,
  buildOptimisticTask,
  insertOptimisticTask,
  isLatestTaskMutation,
  isOptimisticTaskId,
  reconcileOptimisticTask,
  removeOptimisticTask,
  updateOptimisticTask,
} from "@/lib/optimistic-tasks";

import { useTaskStore } from "@/store/task";

import { NewTask, Task, TaskStatus } from "@/types/task";

/* The store raises notices while it mutates. They go to the design's
   notification stack, which is not mounted here. */
jest.mock("@/lib/notifications", () => ({
  notify: {
    dismiss: jest.fn(),
    error: jest.fn(),
    loading: jest.fn(() => "notice-id"),
    success: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock("zustand/middleware", () => ({
  ...jest.requireActual("zustand/middleware"),
  persist: <T>(initializer: T) => initializer,
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Write launch brief",
    status: TaskStatus.TODO,
    tags: [],
    createdAt: new Date("2026-07-13T09:00:00.000Z"),
    updatedAt: new Date("2026-07-13T09:00:00.000Z"),
    isRecurring: false,
    isAutoScheduled: false,
    scheduleLocked: false,
    hardDeadline: false,
    isArchived: false,
    ...overrides,
  };
}

function makeNewTask(overrides: Partial<NewTask> = {}): NewTask {
  return {
    title: "Plan launch",
    status: TaskStatus.TODO,
    isRecurring: false,
    isAutoScheduled: false,
    scheduleLocked: false,
    ...overrides,
  };
}

describe("optimistic task projections", () => {
  it("inserts a temporary task and reconciles it without duplicates", () => {
    const existing = makeTask();
    const optimistic = buildOptimisticTask(
      makeNewTask(),
      [],
      "optimistic-task:test"
    );
    const pendingTasks = insertOptimisticTask([existing], optimistic);

    expect(isOptimisticTaskId(pendingTasks[0].id)).toBe(true);

    const saved = makeTask({ id: "task-2", title: optimistic.title });
    const reconciled = reconcileOptimisticTask(
      pendingTasks,
      saved,
      optimistic.id
    );

    expect(reconciled.map((task) => task.id)).toEqual(["task-2", "task-1"]);
  });

  it("applies move and completion updates immediately", () => {
    const task = makeTask();
    const scheduledStart = new Date("2026-07-13T12:00:00.000Z");
    const moved = updateOptimisticTask(
      [task],
      task.id,
      { scheduledStart, scheduleLocked: true },
      []
    );
    const completed = updateOptimisticTask(
      moved,
      task.id,
      { status: TaskStatus.COMPLETED },
      []
    );

    expect(completed[0]).toMatchObject({
      scheduledStart,
      scheduleLocked: true,
      status: TaskStatus.COMPLETED,
    });
  });

  it("removes a task immediately", () => {
    expect(removeOptimisticTask([makeTask()], "task-1")).toEqual([]);
  });

  it("does not let an older task response win", () => {
    const olderVersion = beginTaskMutation("task-1");
    const latestVersion = beginTaskMutation("task-1");

    expect(isLatestTaskMutation("task-1", olderVersion)).toBe(false);
    expect(isLatestTaskMutation("task-1", latestVersion)).toBe(true);
  });
});

describe("task store rollback", () => {
  const originalFetch = global.fetch;

  function installFailingFetch(error: Error) {
    const fetchImplementation: typeof fetch = () => Promise.reject(error);
    global.fetch = jest.fn(fetchImplementation);
  }

  beforeEach(() => {
    useTaskStore.setState({
      tasks: [makeTask()],
      tags: [],
      loading: false,
      error: null,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("rolls an update back when the request fails", async () => {
    installFailingFetch(new Error("Offline"));

    const pending = useTaskStore
      .getState()
      .updateTask("task-1", { title: "Optimistic title" });

    expect(useTaskStore.getState().tasks[0].title).toBe("Optimistic title");
    await expect(pending).rejects.toThrow("Offline");
    expect(useTaskStore.getState().tasks[0].title).toBe("Write launch brief");
  });

  it("rolls a create back when the request fails", async () => {
    installFailingFetch(new Error("Offline"));

    const pending = useTaskStore.getState().createTask(makeNewTask());

    expect(useTaskStore.getState().tasks[0].title).toBe("Plan launch");
    await expect(pending).rejects.toThrow("Offline");
    expect(useTaskStore.getState().tasks).toEqual([makeTask()]);
  });

  it("rolls a delete back when the request fails", async () => {
    installFailingFetch(new Error("Offline"));

    const pending = useTaskStore.getState().deleteTask("task-1");

    expect(useTaskStore.getState().tasks).toEqual([]);
    await expect(pending).rejects.toThrow("Offline");
    expect(useTaskStore.getState().tasks).toEqual([makeTask()]);
  });

  it("keeps the optimistic task when the service worker queues the update", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ queued: true }), { status: 202 })
      )
    );

    const updated = await useTaskStore
      .getState()
      .updateTask("task-1", { title: "Queued title" });

    expect(updated.title).toBe("Queued title");
    expect(useTaskStore.getState().tasks[0].title).toBe("Queued title");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
