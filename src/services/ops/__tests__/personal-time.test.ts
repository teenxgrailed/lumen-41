import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { OpError, runOp, undoAction } from "..";
import { loadPersonalOccurrences } from "../../personal-time/service";
import { createFakePrisma } from "./fake-prisma";
import { OWNER_ID, WORKSPACE_ID, access, opts } from "./harness";

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
  return { ...actual, resolveWorkspaceAccess: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const workspaceAuth = require("@/lib/auth/workspace-auth");

let db = mockState.db;

beforeEach(() => {
  jest.clearAllMocks();
  mockState.db = createFakePrisma();
  db = mockState.db;
  workspaceAuth.resolveWorkspaceAccess.mockImplementation(
    async ({ requestedWorkspaceId }: { requestedWorkspaceId?: string }) =>
      access(WorkspaceRole.OWNER, requestedWorkspaceId ?? WORKSPACE_ID)
  );
});

const block = (id: string) =>
  db.tables.personalBlock.find((row) => row.id === id)!;

type View = {
  id: string;
  title: string;
  emoji: string | null;
  kind: string;
  start: string;
  end: string;
  rrule: string | null;
  sourceEventId: string | null;
};

describe("personal time ops", () => {
  it("personal.create fills a preset's title, emoji and length, and undo removes it", async () => {
    const created = await runOp<{ block: View }>(
      "personal.create",
      { kind: "lunch", start: "2026-10-19T13:00:00.000Z" },
      opts()
    );
    const view = created.result.block;
    expect(view.title).toBe("Lunch");
    expect(view.emoji).toBe("🍽️");
    expect(view.end).toBe("2026-10-19T14:00:00.000Z");
    expect(created.undoable).toBe(true);
    expect(block(view.id).archivedAt ?? null).toBeNull();

    const undone = await undoAction(created.actionId!, OWNER_ID);
    expect(undone.status).toBe("undone");
    expect(block(view.id).archivedAt).not.toBeNull();
  });

  it("personal.create needs a title for a custom block and an end after the start", async () => {
    await expect(
      runOp("personal.create", { start: "2026-10-19T13:00:00.000Z" }, opts())
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      runOp(
        "personal.create",
        {
          kind: "walk",
          start: "2026-10-19T13:00:00.000Z",
          end: "2026-10-19T12:00:00.000Z",
        },
        opts()
      )
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      runOp(
        "personal.create",
        {
          kind: "walk",
          start: "2026-10-19T13:00:00.000Z",
          rrule: "NOT A RULE",
        },
        opts()
      )
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("personal.update writes the previous values back on undo", async () => {
    const created = await runOp<{ block: View }>(
      "personal.create",
      { kind: "walk", start: "2026-10-19T17:00:00.000Z" },
      opts()
    );
    const id = created.result.block.id;
    const moved = await runOp(
      "personal.update",
      {
        blockId: id,
        title: "Long walk",
        start: "2026-10-19T17:30:00.000Z",
        end: "2026-10-19T18:30:00.000Z",
      },
      opts()
    );
    expect(block(id).title).toBe("Long walk");

    expect((await undoAction(moved.actionId!, OWNER_ID)).status).toBe("undone");
    expect(block(id).title).toBe("Walk");
    expect((block(id).start as Date).toISOString()).toBe(
      "2026-10-19T17:00:00.000Z"
    );
  });

  it("personal.delete keeps the block so undo brings it back", async () => {
    const created = await runOp<{ block: View }>(
      "personal.create",
      { kind: "gym", start: "2026-10-19T18:00:00.000Z" },
      opts()
    );
    const id = created.result.block.id;
    const removed = await runOp("personal.delete", { blockId: id }, opts());
    expect(block(id).archivedAt).not.toBeNull();
    await expect(
      runOp("personal.delete", { blockId: id }, opts())
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect((await undoAction(removed.actionId!, OWNER_ID)).status).toBe(
      "undone"
    );
    expect(block(id).archivedAt ?? null).toBeNull();
  });

  it("personal.mark_event links a synced event and never touches the event", async () => {
    const feed = await db.seed("calendarFeed", {
      userId: OWNER_ID,
      type: "GOOGLE",
      enabled: true,
    });
    const event = await db.seed("calendarEvent", {
      feedId: feed.id,
      title: "Lunch with Sam",
      start: new Date("2026-10-20T12:00:00.000Z"),
      end: new Date("2026-10-20T13:00:00.000Z"),
    });
    const marked = await runOp<{ block: View; already: boolean }>(
      "personal.mark_event",
      { eventId: event.id, kind: "lunch" },
      opts()
    );
    expect(marked.result.already).toBe(false);
    expect(marked.result.block.sourceEventId).toBe(event.id);
    expect(marked.result.block.start).toBe("2026-10-20T12:00:00.000Z");
    expect(db.tables.calendarEvent[0].title).toBe("Lunch with Sam");

    const again = await runOp<{ already: boolean }>(
      "personal.mark_event",
      { eventId: event.id },
      opts()
    );
    expect(again.result.already).toBe(true);
    expect(db.tables.personalBlock).toHaveLength(1);

    await undoAction(marked.actionId!, OWNER_ID);
    expect(db.tables.personalBlock[0].archivedAt).not.toBeNull();
  });

  it("personal.mark_event refuses another person's event", async () => {
    const feed = await db.seed("calendarFeed", {
      userId: "user-2",
      type: "GOOGLE",
      enabled: true,
    });
    const event = await db.seed("calendarEvent", {
      feedId: feed.id,
      title: "Theirs",
      start: new Date("2026-10-20T12:00:00.000Z"),
      end: new Date("2026-10-20T13:00:00.000Z"),
    });
    await expect(
      runOp("personal.mark_event", { eventId: event.id }, opts())
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("personal.set_default repeats a kind on the chosen days and undo restores it", async () => {
    await db.seed("userSettings", { userId: OWNER_ID, timeZone: "UTC" });
    const first = await runOp<{ block: View }>(
      "personal.set_default",
      { kind: "lunch", enabled: true, at: "13:00", minutes: 60 },
      opts()
    );
    const id = first.result.block.id;
    expect(first.result.block.rrule).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(block(id).isDefault).toBe(true);

    const changed = await runOp<{ block: View }>(
      "personal.set_default",
      { kind: "lunch", enabled: true, at: "12:30", days: [1, 3] },
      opts()
    );
    expect(changed.result.block.id).toBe(id);
    expect(block(id).rrule).toBe("FREQ=WEEKLY;BYDAY=MO,WE");
    expect(db.tables.personalBlock).toHaveLength(1);

    await undoAction(changed.actionId!, OWNER_ID);
    expect(block(id).rrule).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");

    const off = await runOp(
      "personal.set_default",
      { kind: "lunch", enabled: false },
      opts()
    );
    expect(block(id).archivedAt).not.toBeNull();
    await undoAction(off.actionId!, OWNER_ID);
    expect(block(id).archivedAt ?? null).toBeNull();
  });

  it("personal.list returns the occurrences of a repeat in a range", async () => {
    await db.seed("userSettings", { userId: OWNER_ID, timeZone: "UTC" });
    await runOp(
      "personal.create",
      {
        kind: "lunch",
        start: "2026-10-19T13:00:00.000Z",
        rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      },
      opts()
    );
    const listed = await runOp<{
      blocks: View[];
      occurrences: Array<{ start: string; end: string }>;
    }>(
      "personal.list",
      { from: "2026-10-19T00:00:00.000Z", to: "2026-10-26T00:00:00.000Z" },
      opts(WorkspaceRole.VIEWER)
    );
    expect(listed.result.blocks).toHaveLength(1);
    expect(listed.result.occurrences.map((o) => o.start)).toEqual([
      "2026-10-19T13:00:00.000Z",
      "2026-10-20T13:00:00.000Z",
      "2026-10-21T13:00:00.000Z",
      "2026-10-22T13:00:00.000Z",
      "2026-10-23T13:00:00.000Z",
    ]);
  });

  it("is personal-workspace only and a viewer cannot write", async () => {
    const shared = {
      userId: OWNER_ID,
      workspace: {
        ...access(),
        workspaceKind: WorkspaceKind.SHARED,
      },
      actor: "agent" as const,
    };
    await expect(
      runOp(
        "personal.create",
        { kind: "walk", start: "2026-10-19T17:00:00.000Z" },
        shared
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      runOp(
        "personal.create",
        { kind: "walk", start: "2026-10-19T17:00:00.000Z" },
        opts(WorkspaceRole.VIEWER)
      )
    ).rejects.toBeInstanceOf(OpError);
  });

  it("a block linked to an event follows the event when it moves", async () => {
    await db.seed("userSettings", { userId: OWNER_ID, timeZone: "UTC" });
    const feed = await db.seed("calendarFeed", {
      userId: OWNER_ID,
      type: "GOOGLE",
      enabled: true,
    });
    const event = await db.seed("calendarEvent", {
      feedId: feed.id,
      title: "Gym class",
      start: new Date("2026-10-20T18:00:00.000Z"),
      end: new Date("2026-10-20T19:00:00.000Z"),
    });
    await runOp("personal.mark_event", { eventId: event.id }, opts());
    db.tables.calendarEvent[0].start = new Date("2026-10-21T07:00:00.000Z");
    db.tables.calendarEvent[0].end = new Date("2026-10-21T08:00:00.000Z");

    const found = await loadPersonalOccurrences(
      OWNER_ID,
      new Date("2026-10-20T00:00:00.000Z"),
      new Date("2026-10-23T00:00:00.000Z")
    );
    expect(found).toHaveLength(1);
    expect(found[0].start.toISOString()).toBe("2026-10-21T07:00:00.000Z");
  });
});
