import { undoAction, undoRun } from "@/services/ops";
import { createFakePrisma } from "@/services/ops/__tests__/fake-prisma";
import {
  OWNER_ID,
  WORKSPACE_ID,
  access,
  seedTask,
  taskRow,
} from "@/services/ops/__tests__/harness";
import { scheduleAllTasksForUser } from "@/services/scheduling/TaskSchedulingService";
import { WorkspaceRole } from "@prisma/client";

import { canPlanMyDay } from "@/lib/entitlements";

import type { AgentStreamEvent } from "../agent/events";
import {
  MAX_WRITES_PER_TURN,
  WRITE_LIMIT_MESSAGE,
  isMutatingToolCall,
  runAgentTurn,
  runConfirmedToolCall,
} from "../agent/loop";
import type { AgentTurnEvent, AgentTurnRequest, SchedulerAI } from "../types";
import { unwrapUntrusted } from "../untrusted";

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
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/services/connectors/webhooks", () => ({
  sendConnectorWebhook: jest.fn(),
}));
jest.mock("@/services/time-tracking/timeEntries", () => ({
  recomputeTaskActuals: jest.fn(),
}));
jest.mock("@/lib/entitlements", () => ({
  getPlan: jest.fn().mockResolvedValue("PRO"),
  canPlanMyDay: jest.fn().mockResolvedValue({ allowed: true }),
}));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn(),
  scheduleAllTasksForUserDetailed: jest.fn(),
}));
jest.mock("@/lib/flexible-hours-guard-server", () => ({
  isPlacementBlocked: jest.fn().mockResolvedValue(false),
}));
jest.mock("@/lib/auth/workspace-auth", () => {
  const actual = jest.requireActual("@/lib/auth/workspace-auth");
  return { ...actual, resolveWorkspaceAccess: jest.fn() };
});
jest.mock("../agent/legacy-tools", () => ({ executeTool: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const workspaceAuth = require("@/lib/auth/workspace-auth");

let db = mockState.db;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(scheduleAllTasksForUser).mockReset();
  mockState.db = createFakePrisma();
  db = mockState.db;
  workspaceAuth.resolveWorkspaceAccess.mockImplementation(
    async ({ requestedWorkspaceId }: { requestedWorkspaceId?: string }) =>
      access(WorkspaceRole.OWNER, requestedWorkspaceId ?? WORKSPACE_ID)
  );
});

const settings = { allowParseTasks: true, allowFullAuto: true };

const call = (id: string, name: string, args: Record<string, unknown>) =>
  ({
    type: "tool_call",
    id,
    name,
    arguments: args,
    rawArguments: JSON.stringify(args),
  }) satisfies AgentTurnEvent;

const say = (value: string) => ({ type: "text", value }) as const;

/** A provider that plays back scripted turns and records what it was sent. */
function scripted(turns: AgentTurnEvent[][]) {
  const requests: AgentTurnRequest[] = [];
  let index = 0;
  const ai: SchedulerAI = {
    name: "scripted",
    suggestSchedule: jest.fn(),
    parseTasks: jest.fn(),
    async *streamTurn(request) {
      requests.push({
        ...request,
        messages: JSON.parse(JSON.stringify(request.messages)),
      });
      for (const event of turns[index++] ?? []) yield event;
    },
  };
  return { ai, requests };
}

function turn(
  ai: SchedulerAI,
  overrides: { role?: WorkspaceRole; history?: string } = {}
) {
  const events: AgentStreamEvent[] = [];
  const base = {
    ai,
    settings,
    userId: OWNER_ID,
    workspace: access(overrides.role ?? WorkspaceRole.OWNER),
    pageActor: OWNER_ID,
    emit: (event: AgentStreamEvent) => events.push(event),
  };
  return {
    events,
    base,
    run: () =>
      runAgentTurn({
        ...base,
        systemPrompt: "system",
        history: [{ role: "user", content: overrides.history ?? "do it" }],
      }),
  };
}

describe("agent loop: tool calls are ops, and ops are undoable", () => {
  it("creates a task, feeds the result back, answers, and Undo all removes it", async () => {
    const { ai, requests } = scripted([
      [
        say("On it."),
        call("c1", "create_task", { title: "Call the bank", priority: "HIGH" }),
      ],
      [say("Added it for you.")],
    ]);
    const t = turn(ai);
    const result = await t.run();

    expect(result.text).toBe("On it.\n\nAdded it for you.");
    expect(result.changed).toBe(true);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      label: "Created task “Call the bank”",
      undoable: true,
    });
    expect(db.tables.task).toHaveLength(1);
    expect(db.tables.task[0]).toMatchObject({
      title: "Call the bank",
      priorityLevel: "HIGH",
    });

    // the second model request carries the tool result back
    const second = requests[1].messages;
    expect(second[second.length - 1]).toMatchObject({
      role: "tool",
      toolCallId: "c1",
    });
    expect(second[second.length - 2]).toMatchObject({
      role: "assistant",
      toolCalls: [{ id: "c1", name: "create_task" }],
    });

    expect(t.events.map((event) => event.type)).toEqual([
      "token",
      "tool",
      "tool",
      "token",
    ]);
    expect(t.events[1]).toMatchObject({
      status: "running",
      name: "create_task",
    });
    expect(t.events[2]).toMatchObject({ status: "done" });

    // one run holds the action; Undo all reverses it
    expect(result.runId).toBeTruthy();
    const undone = await undoRun(result.runId!, OWNER_ID, "user");
    expect(undone.status).toBe("undone");
    expect(taskRow(db, db.tables.task[0].id as string).isArchived).toBe(true);
  });

  it("does several writes in one run and undoes them newest first", async () => {
    const task = await seedTask(db, { title: "Report", dueDate: null });
    const { ai } = scripted([
      [
        call("a", "update_task", { taskId: task.id, priority: "URGENT" }),
        call("b", "move_task", { taskId: task.id, date: "2026-10-30" }),
        call("c", "complete_task", { taskId: task.id }),
      ],
      [say("Done.")],
    ]);
    const result = await turn(ai).run();
    expect(result.actions.map((action) => action.label)).toEqual([
      "Updated task “Report”",
      "Moved “Report” to 2026-10-30",
      "Completed “Report”",
    ]);
    expect(taskRow(db, task.id as string).status).toBe("completed");

    // a single action undoes on its own
    expect(
      (await undoAction(result.actions[2].actionId, OWNER_ID)).status
    ).toBe("undone");
    expect(taskRow(db, task.id as string).status).toBe("todo");

    const rest = await undoRun(result.runId!, OWNER_ID, "user");
    expect(rest.status).toBe("undone");
    expect(taskRow(db, task.id as string).priorityLevel).toBe("MEDIUM");
  });

  it("does not delete without a yes, then deletes exactly that call on confirm", async () => {
    const task = await seedTask(db, { title: "Old plan" });
    const { ai } = scripted([[call("d", "delete_task", { taskId: task.id })]]);
    const t = turn(ai);
    const result = await t.run();

    expect(result.pending).toMatchObject({
      tool: { name: "delete_task", arguments: { taskId: task.id } },
    });
    expect(result.pending?.prompt).toContain("Archive task “Old plan”?");
    expect(result.actions).toHaveLength(0);
    expect(taskRow(db, task.id as string).isArchived).toBe(false);
    expect(db.tables.agentAction).toHaveLength(0);

    const confirmed = await runConfirmedToolCall(
      { ...t.base, emit: () => undefined },
      result.pending!.tool
    );
    expect(confirmed.text).toBe("Archived “Old plan”.");
    expect(taskRow(db, task.id as string).isArchived).toBe(true);
    expect(confirmed.actions[0].undoable).toBe(true);
    expect(
      (await undoAction(confirmed.actions[0].actionId, OWNER_ID)).status
    ).toBe("undone");
    expect(taskRow(db, task.id as string).isArchived).toBe(false);
  });

  it("resolves a task by exact title and refuses an ambiguous one", async () => {
    await seedTask(db, { title: "Taxes" });
    await seedTask(db, { title: "Taxes" });
    const solo = await seedTask(db, { title: "Gym" });
    const { ai, requests } = scripted([
      [
        call("x", "complete_task", { titleQuery: "Taxes" }),
        call("y", "complete_task", { titleQuery: "Gym" }),
      ],
      [say("ok")],
    ]);
    await turn(ai).run();
    const tools = requests[1].messages.filter((m) => m.role === "tool");
    expect(
      JSON.parse(unwrapUntrusted((tools[0] as { content: string }).content))
    ).toMatchObject({
      ok: false,
      error: "ambiguous",
    });
    expect(taskRow(db, solo.id as string).status).toBe("completed");
  });

  it("tells the model when its arguments are invalid and changes nothing", async () => {
    const { ai, requests } = scripted([
      [call("z", "create_task", { title: "", nonsense: true })],
      [say("Sorry.")],
    ]);
    const result = await turn(ai).run();
    expect(db.tables.task).toHaveLength(0);
    expect(result.changed).toBe(false);
    const message = requests[1].messages.at(-1) as { content: string };
    expect(JSON.parse(unwrapUntrusted(message.content)).error).toMatch(
      /Invalid arguments/
    );
  });

  it("keeps a viewer from every write", async () => {
    const { ai } = scripted([
      [call("v", "create_task", { title: "Nope" })],
      [say("You cannot.")],
    ]);
    const result = await turn(ai, { role: WorkspaceRole.VIEWER }).run();
    expect(db.tables.task).toHaveLength(0);
    expect(result.actions).toHaveLength(0);
  });

  it("stops after a bounded number of model round trips", async () => {
    const loopForever = Array.from({ length: 10 }, (_, i) => [
      call(`l${i}`, "list_habits", {}),
    ]);
    const { ai, requests } = scripted(loopForever);
    await turn(ai).run();
    expect(requests.length).toBe(6);
    // the last request offers no tools, so the model has to answer in words
    expect(requests[5].tools).toEqual([]);
  });

  it("an event is added and removed through ops, with Undo", async () => {
    await db.seed("calendarFeed", {
      userId: OWNER_ID,
      type: "LOCAL",
      enabled: true,
    });
    const { ai } = scripted([
      [
        call("e", "create_event", {
          title: "Dentist",
          start: "2026-10-22T09:00:00.000Z",
          end: "2026-10-22T10:00:00.000Z",
        }),
      ],
      [say("Booked.")],
    ]);
    const result = await turn(ai).run();
    expect(db.tables.calendarEvent).toHaveLength(1);
    await undoRun(result.runId!, OWNER_ID, "user");
    expect(db.tables.calendarEvent[0].archivedAt).not.toBeNull();
  });

  it("plan_day is one undoable action that says where tasks went", async () => {
    const task = await seedTask(db, {
      title: "Taxes",
      isAutoScheduled: true,
      estimatedMinutes: 60,
    });
    jest.mocked(scheduleAllTasksForUser).mockImplementation(async () => {
      await (
        db.client as { task: { update: (a: unknown) => Promise<unknown> } }
      ).task.update({
        where: { id: task.id },
        data: {
          scheduledStart: new Date("2026-10-21T09:00:00.000Z"),
          scheduledEnd: new Date("2026-10-21T10:00:00.000Z"),
        },
      });
      return [];
    });
    const { ai, requests } = scripted([
      [call("p", "plan_day", {})],
      [say("Planned.")],
    ]);
    const result = await turn(ai).run();
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].label).toBe("Placed 1 task");
    const toolMessage = requests[1].messages.at(-1) as { content: string };
    expect(
      JSON.parse(unwrapUntrusted(toolMessage.content)).placed[0]
    ).toMatchObject({
      title: "Taxes",
      moved: false,
    });
    await undoRun(result.runId!, OWNER_ID, "user");
    expect(taskRow(db, task.id as string).scheduledStart).toBeNull();
  });

  it("plan_day is refused on Free", async () => {
    jest
      .mocked(canPlanMyDay)
      .mockResolvedValueOnce({ allowed: false } as never);
    const { ai } = scripted([[call("p", "plan_day", {})], [say("No.")]]);
    const result = await turn(ai).run();
    expect(result.actions).toHaveLength(0);
    expect(scheduleAllTasksForUser).not.toHaveBeenCalled();
  });
});

describe("agent loop: a turn can only change so much", () => {
  const creates = (count: number, prefix = "c") =>
    Array.from({ length: count }, (_, i) =>
      call(`${prefix}${i}`, "create_task", { title: `Task ${prefix}${i}` })
    );

  it("runs the first writes, refuses the rest, and says so", async () => {
    const { ai, requests } = scripted([
      creates(MAX_WRITES_PER_TURN + 5),
      [say("should never be asked for")],
    ]);
    const t = turn(ai);
    const result = await t.run();

    expect(db.tables.task).toHaveLength(MAX_WRITES_PER_TURN);
    expect(result.actions).toHaveLength(MAX_WRITES_PER_TURN);
    expect(result.writeLimitReached).toBe(true);
    expect(result.text).toBe(WRITE_LIMIT_MESSAGE);
    // The turn ends there: the model is not called again to keep going.
    expect(requests).toHaveLength(1);
    expect(t.events.at(-1)).toMatchObject({
      type: "token",
      value: WRITE_LIMIT_MESSAGE,
    });
  });

  it("counts writes across the model's round trips, not per step", async () => {
    const { ai, requests } = scripted([
      creates(6, "a"),
      creates(6, "b"),
      [say("unreachable")],
    ]);
    const result = await turn(ai).run();
    expect(db.tables.task).toHaveLength(MAX_WRITES_PER_TURN);
    expect(result.writeLimitReached).toBe(true);
    expect(requests).toHaveLength(2);
  });

  it("does not count reads", async () => {
    const reads = Array.from({ length: 30 }, (_, i) =>
      call(`r${i}`, "list_habits", {})
    );
    const { ai } = scripted([
      reads,
      creates(MAX_WRITES_PER_TURN),
      [say("Done.")],
    ]);
    const result = await turn(ai).run();
    expect(result.writeLimitReached).toBe(false);
    expect(db.tables.task).toHaveLength(MAX_WRITES_PER_TURN);
    expect(result.text).toBe("Done.");
  });

  it("tells reads from writes for the legacy tools too", () => {
    expect(isMutatingToolCall("create_task", {})).toBe(true);
    expect(isMutatingToolCall("list_tasks", {})).toBe(false);
    expect(isMutatingToolCall("search_mail", { query: "x" })).toBe(false);
    expect(isMutatingToolCall("get_message", { messageId: "m" })).toBe(false);
    expect(isMutatingToolCall("manage_projects", { action: "list" })).toBe(
      false
    );
    expect(isMutatingToolCall("manage_projects", { action: "create" })).toBe(
      true
    );
    expect(isMutatingToolCall("create_task_from_email", {})).toBe(true);
    expect(isMutatingToolCall("update_work_hours", {})).toBe(true);
    expect(isMutatingToolCall("remember", {})).toBe(true);
    // Anything it does not know counts as a change.
    expect(isMutatingToolCall("something_new", {})).toBe(true);
  });
});
