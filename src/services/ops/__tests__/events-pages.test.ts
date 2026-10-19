import {
  appendPageBlocks,
  createPage,
  getPage,
  updatePage,
} from "@/services/pages/page-service";
import { writePageBlocks } from "@/services/pages/page-write-path";
import { WorkspaceRole } from "@prisma/client";

import { publishRealtimeEvent } from "@/lib/realtime/publish";

import { OpError, runOp, undoAction } from "..";
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
jest.mock("@/lib/flexible-hours-guard-server", () => ({
  isPlacementBlocked: jest.fn().mockResolvedValue(false),
}));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn(),
  scheduleAllTasksForUserDetailed: jest.fn(),
}));
jest.mock("@/services/pages/page-service", () => ({
  appendPageBlocks: jest.fn(),
  createPage: jest.fn(),
  getPage: jest.fn(),
  updatePage: jest.fn(),
}));
jest.mock("@/services/pages/page-write-path", () => ({
  ...jest.requireActual("@/services/pages/page-write-path"),
  writePageBlocks: jest.fn(),
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

async function seedFeed(type = "LOCAL", userId = OWNER_ID) {
  return db.seed("calendarFeed", { userId, type, enabled: true });
}

function eventRow(id: string) {
  return db.tables.calendarEvent.find((row) => row.id === id)!;
}

const START = "2026-10-20T09:00:00.000Z";
const END = "2026-10-20T10:00:00.000Z";

describe("event ops", () => {
  it("event.create is undone by removing the event from the calendar", async () => {
    await seedFeed();
    const created = await runOp<{ event: { id: string } }>(
      "event.create",
      { title: "Dentist", start: START, end: END },
      opts()
    );
    const id = created.result.event.id;
    expect(eventRow(id).archivedAt).toBeNull();
    expect(created.undoable).toBe(true);
    expect(publishRealtimeEvent).toHaveBeenCalledWith(
      OWNER_ID,
      "calendar-updated"
    );

    const undone = await undoAction(created.actionId!, OWNER_ID);
    expect(undone.status).toBe("undone");
    expect(eventRow(id).archivedAt).not.toBeNull();
  });

  it("event.update writes the previous values back on undo", async () => {
    const feed = await seedFeed();
    const event = await db.seed("calendarEvent", {
      feedId: feed.id,
      title: "Standup",
      start: new Date(START),
      end: new Date(END),
    });
    const moved = await runOp(
      "event.update",
      {
        eventId: event.id,
        title: "Standup (moved)",
        start: "2026-10-21T09:00:00.000Z",
        end: "2026-10-21T09:30:00.000Z",
      },
      opts()
    );
    expect(eventRow(event.id).title).toBe("Standup (moved)");

    expect((await undoAction(moved.actionId!, OWNER_ID)).status).toBe("undone");
    const back = eventRow(event.id);
    expect(back.title).toBe("Standup");
    expect((back.start as Date).toISOString()).toBe(START);
    expect((back.end as Date).toISOString()).toBe(END);
  });

  it("event.update refuses an end before the start", async () => {
    const feed = await seedFeed();
    const event = await db.seed("calendarEvent", {
      feedId: feed.id,
      title: "Call",
      start: new Date(START),
      end: new Date(END),
    });
    await expect(
      runOp(
        "event.update",
        { eventId: event.id, end: "2026-10-20T08:00:00.000Z" },
        opts()
      )
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("event.delete keeps the event so undo brings it back", async () => {
    const feed = await seedFeed();
    const event = await db.seed("calendarEvent", {
      feedId: feed.id,
      title: "Lunch",
      start: new Date(START),
      end: new Date(END),
    });
    const deleted = await runOp("event.delete", { eventId: event.id }, opts());
    expect(eventRow(event.id).archivedAt).not.toBeNull();

    expect((await undoAction(deleted.actionId!, OWNER_ID)).status).toBe(
      "undone"
    );
    expect(eventRow(event.id).archivedAt).toBeNull();
  });

  it("refuses to change a synced provider event", async () => {
    const feed = await seedFeed("GOOGLE");
    const event = await db.seed("calendarEvent", {
      feedId: feed.id,
      title: "Synced",
      start: new Date(START),
      end: new Date(END),
    });
    await expect(
      runOp("event.delete", { eventId: event.id }, opts())
    ).rejects.toMatchObject({ code: "UNSUPPORTED" });
  });

  it("does not reach another person's event", async () => {
    const feed = await seedFeed("LOCAL", "someone-else");
    const event = await db.seed("calendarEvent", {
      feedId: feed.id,
      title: "Private",
      start: new Date(START),
      end: new Date(END),
    });
    await expect(
      runOp("event.delete", { eventId: event.id }, opts())
    ).rejects.toBeInstanceOf(OpError);
  });
});

describe("page ops", () => {
  async function seedPage() {
    return (await db.seed("page", {
      title: "Notes",
      contentRevision: 0,
      documentFormatVersion: 1,
      blocks: [],
    })) as Record<string, unknown> & { id: string; updatedAt: Date };
  }

  it("page.create is undone by moving the page to Trash", async () => {
    const page = await seedPage();
    jest.mocked(createPage).mockResolvedValue(page as never);
    jest.mocked(updatePage).mockResolvedValue(page as never);

    const created = await runOp<{ page: { id: string; href: string } }>(
      "page.create",
      { title: "Trip plan" },
      opts()
    );
    expect(created.result.page.href).toBe(`/pages/${page.id}`);
    expect(publishRealtimeEvent).toHaveBeenCalledWith(OWNER_ID, "docs-updated");
    expect(jest.mocked(createPage).mock.calls[0][1]).toMatchObject({
      title: "Trip plan",
      createdBy: "AI",
    });

    const undone = await undoAction(created.actionId!, OWNER_ID);
    expect(undone.status).toBe("undone");
    expect(jest.mocked(updatePage)).toHaveBeenCalledWith(
      expect.anything(),
      page.id,
      { trashed: true }
    );
  });

  it("page.append is undone by removing exactly the appended blocks", async () => {
    const page = await seedPage();
    const old = { id: "b-old", position: 1024, parentBlockId: null };
    const added = { id: "b-new", position: 2048, parentBlockId: null };
    const block = (b: { id: string; position: number }) => ({
      ...b,
      type: "PARAGRAPH",
      content: { text: b.id },
      createdBy: "HUMAN",
      parentBlockId: null,
    });
    jest
      .mocked(getPage)
      .mockResolvedValueOnce({
        ...page,
        blocks: [block(old)],
        documentFormatVersion: 1,
        contentRevision: 3,
      } as never)
      .mockResolvedValueOnce({
        ...page,
        blocks: [block(old), block(added)],
        documentFormatVersion: 1,
        contentRevision: 4,
      } as never);
    jest.mocked(appendPageBlocks).mockResolvedValue({
      ...page,
      blocks: [block(old), block(added)],
    } as never);
    jest
      .mocked(writePageBlocks)
      .mockResolvedValue({ ...page, blocks: [block(old)] } as never);

    const appended = await runOp(
      "page.append",
      { pageId: page.id, text: "Remember the passport" },
      opts()
    );
    expect(appended.undoable).toBe(true);

    const undone = await undoAction(appended.actionId!, OWNER_ID);
    expect(undone.status).toBe("undone");
    const kept = jest.mocked(writePageBlocks).mock.calls[0][2];
    expect(kept.map((b) => b.id)).toEqual(["b-old"]);
  });

  it("page.append reports a page it cannot edit", async () => {
    jest.mocked(getPage).mockResolvedValue(null as never);
    await expect(
      runOp("page.append", { pageId: "nope", text: "x" }, opts())
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
