import { NextRequest, NextResponse } from "next/server";

import { POST as connectConvert } from "@/app/api/connect/ideas/[id]/convert/route";
import { POST as connectShown } from "@/app/api/connect/ideas/[id]/shown/route";
import { GET as connectCards } from "@/app/api/connect/ideas/cards/route";
import {
  POST as connectCreate,
  GET as connectList,
} from "@/app/api/connect/ideas/route";
import { POST as convert } from "@/app/api/ideas/[id]/convert/route";
import { PATCH as patchIdea } from "@/app/api/ideas/[id]/route";
import { POST as shown } from "@/app/api/ideas/[id]/shown/route";
import { POST as skip } from "@/app/api/ideas/[id]/skip/route";
import { POST as take } from "@/app/api/ideas/[id]/take/route";
import { GET as cards } from "@/app/api/ideas/cards/route";
import { POST as create, GET as list } from "@/app/api/ideas/route";
import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { createFakePrisma } from "@/services/ops/__tests__/fake-prisma";
import {
  OWNER_ID,
  access,
  seedTask,
  taskRow,
} from "@/services/ops/__tests__/harness";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { ideaCardsEnabled } from "@/lib/feature-flags";

const mockState = { db: createFakePrisma() };

jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockState.db.client;
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn(),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/lib/activation-events", () => ({ recordActivation: jest.fn() }));
jest.mock("@/lib/feature-flags", () => ({
  ideaCardsEnabled: jest.fn().mockResolvedValue(true),
}));
jest.mock("@/services/connectors/webhooks", () => ({
  sendConnectorWebhook: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/time-tracking/timeEntries", () => ({
  recomputeTaskActuals: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/mail-db", () => ({ getMailMessage: jest.fn() }));
jest.mock("@/lib/entitlements", () => ({
  getPlan: jest.fn().mockResolvedValue("FREE"),
}));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn().mockResolvedValue([]),
  scheduleAllTasksForUserDetailed: jest.fn(),
}));
jest.mock("@/services/scheduling/spread-capacity", () => ({
  loadSpreadDays: jest
    .fn()
    .mockResolvedValue([{ date: "2026-11-23", free: 240 }]),
}));
jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/services/connectors/auth", () => ({
  authenticateConnectorRequest: jest.fn(),
}));
jest.mock("@/services/ops/http", () => {
  const actual = jest.requireActual("@/services/ops/http");
  return { ...actual, authenticateAgentRequest: jest.fn() };
});

const session = jest.mocked(authenticateRequest);
const token = jest.mocked(authenticateConnectorRequest);

let db = mockState.db;

const NOW = new Date("2026-11-23T09:00:00.000Z");
const url = (path: string) => `http://localhost${path}`;
const req = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(url(path), {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  jest.clearAllMocks();
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      "nextTick",
      "setImmediate",
      "setTimeout",
      "setInterval",
      "clearTimeout",
      "clearInterval",
      "queueMicrotask",
    ],
  });
  mockState.db = createFakePrisma();
  db = mockState.db;
  jest.mocked(ideaCardsEnabled).mockResolvedValue(true);
  session.mockResolvedValue({
    userId: OWNER_ID,
    workspace: access(WorkspaceRole.OWNER),
  } as never);
  token.mockResolvedValue({
    userId: OWNER_ID,
    workspace: access(WorkspaceRole.OWNER),
    bearer: {},
  } as never);
  await db.seed("userSettings", {
    userId: OWNER_ID,
    timeZone: "Europe/Zurich",
  });
});
afterEach(() => jest.useRealTimers());

const seedIdea = (fields: Record<string, unknown> = {}) =>
  seedTask(db, {
    title: "Check AI agents news",
    kind: "IDEA",
    ideaSource: "user",
    ...fields,
  });

describe("the app door: /api/ideas", () => {
  it("creates, lists, edits, skips and takes an idea, each answering with its action", async () => {
    const created = await create(
      req("/api/ideas", "POST", {
        title: "Watch a breakdown",
        estimateMinutes: 20,
      })
    );
    expect(created.status).toBe(200);
    const body = await created.json();
    const id = body.result.task.id as string;
    expect(body.actionId).toBeTruthy();
    expect(taskRow(db, id)).toMatchObject({ kind: "IDEA", ideaSource: "user" });

    const listed = await (await list(req("/api/ideas"))).json();
    expect(listed.result.ideas.map((i: { id: string }) => i.id)).toEqual([id]);

    const edited = await patchIdea(
      req(`/api/ideas/${id}`, "PATCH", { title: "Watch the breakdown" }),
      idParams(id)
    );
    expect(edited.status).toBe(200);
    expect(taskRow(db, id).title).toBe("Watch the breakdown");

    const skipped = await skip(
      req(`/api/ideas/${id}/skip`, "POST"),
      idParams(id)
    );
    expect(skipped.status).toBe(200);
    expect((await skipped.json()).result.archived).toBe(false);

    const taken = await take(
      req(`/api/ideas/${id}/take`, "POST"),
      idParams(id)
    );
    expect(taken.status).toBe(200);
    expect(taskRow(db, id).kind).toBe("TASK");
  });

  it("refuses a date on an idea with a clear 400, and changes nothing", async () => {
    const idea = await seedIdea();
    const res = await patchIdea(
      req(`/api/ideas/${idea.id}`, "PATCH", { dueDate: "2026-11-25" }),
      idParams(idea.id)
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no due date/);
    expect(taskRow(db, idea.id).dueDate).toBeNull();
    const made = await create(
      req("/api/ideas", "POST", { title: "Dated", dueDate: "2026-11-25" })
    );
    expect(made.status).toBe(400);
  });

  it("PATCH only reaches an idea, never a task", async () => {
    const task = await seedTask(db, { title: "Real task" });
    const res = await patchIdea(
      req(`/api/ideas/${task.id}`, "PATCH", { title: "Hacked" }),
      idParams(task.id)
    );
    expect(res.status).toBe(404);
    expect(taskRow(db, task.id).title).toBe("Real task");
  });

  it("convert needs a direction and makes a task an idea, with Undo through the actions API", async () => {
    const task = await seedTask(db, {
      title: "Read news",
      dueDate: new Date("2026-11-20T00:00:00.000Z"),
    });
    const bad = await convert(
      req(`/api/ideas/${task.id}/convert`, "POST", {}),
      idParams(task.id)
    );
    expect(bad.status).toBe(400);
    const res = await convert(
      req(`/api/ideas/${task.id}/convert`, "POST", { to: "idea" }),
      idParams(task.id)
    );
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.undoable).toBe(true);
    expect(taskRow(db, task.id)).toMatchObject({ kind: "IDEA", dueDate: null });
  });

  it("cards returns the day's cards, the same on a second read", async () => {
    await seedIdea({ title: "A" });
    await seedIdea({ title: "B" });
    await seedIdea({ title: "C" });
    const first = await (
      await cards(req("/api/ideas/cards?day=2026-11-23&visibleTasks=6"))
    ).json();
    expect(first.result.day).toBe("2026-11-23");
    expect(first.result.cards).toHaveLength(2);
    const second = await (
      await cards(req("/api/ideas/cards?visibleTasks=6"))
    ).json();
    expect(second.result.cards.map((c: { id: string }) => c.id)).toEqual(
      first.result.cards.map((c: { id: string }) => c.id)
    );
  });

  it("cards is a pure read; shown marks a card displayed, once, with the position", async () => {
    const idea = await seedIdea({ title: "A" });
    await cards(req("/api/ideas/cards?visibleTasks=6"));
    expect(taskRow(db, idea.id).ideaLastShownAt).toBeNull();
    const res = await shown(
      req(`/api/ideas/${idea.id}/shown`, "POST", { position: 2 }),
      idParams(idea.id)
    );
    expect(res.status).toBe(200);
    expect((await res.json()).result).toMatchObject({ shown: true });
    expect(taskRow(db, idea.id).ideaLastShownAt).toBeInstanceOf(Date);
    const again = await shown(
      req(`/api/ideas/${idea.id}/shown`, "POST"),
      idParams(idea.id)
    );
    expect((await again.json()).result).toMatchObject({ reason: "already" });
  });

  it("shown needs an editor seat", async () => {
    const idea = await seedIdea();
    await shown(req(`/api/ideas/${idea.id}/shown`, "POST"), idParams(idea.id));
    expect(session).toHaveBeenLastCalledWith(expect.anything(), "ideas-api", {
      requiredRole: WorkspaceRole.EDITOR,
    });
  });

  it("another member's idea cannot be edited, taken or marked shown", async () => {
    const theirs = await seedIdea({ userId: "other", assigneeId: "other" });
    expect(
      (
        await patchIdea(
          req(`/api/ideas/${theirs.id}`, "PATCH", { title: "Mine" }),
          idParams(theirs.id)
        )
      ).status
    ).toBe(404);
    expect(
      (
        await take(
          req(`/api/ideas/${theirs.id}/take`, "POST"),
          idParams(theirs.id)
        )
      ).status
    ).toBe(404);
    expect(
      (
        await shown(
          req(`/api/ideas/${theirs.id}/shown`, "POST"),
          idParams(theirs.id)
        )
      ).status
    ).toBe(404);
    expect(taskRow(db, theirs.id).title).toBe("Check AI agents news");
    const listed = await (await list(req("/api/ideas"))).json();
    expect(listed.result.ideas).toHaveLength(0);
  });

  it("the connector door marks shown too", async () => {
    const idea = await seedIdea();
    const res = await connectShown(
      req(`/api/connect/ideas/${idea.id}/shown`, "POST"),
      idParams(idea.id)
    );
    expect(res.status).toBe(200);
    expect(taskRow(db, idea.id).ideaLastShownAt).toBeInstanceOf(Date);
  });

  it("answers the session's refusal as it is", async () => {
    session.mockResolvedValue({
      response: NextResponse.json({ error: "no" }, { status: 401 }),
    } as never);
    expect((await list(req("/api/ideas"))).status).toBe(401);
    expect(
      (await create(req("/api/ideas", "POST", { title: "x" }))).status
    ).toBe(401);
  });

  it("a change needs an editor seat, a read only a viewer's", async () => {
    await list(req("/api/ideas"));
    expect(session).toHaveBeenLastCalledWith(expect.anything(), "ideas-api", {
      requiredRole: WorkspaceRole.VIEWER,
    });
    await create(req("/api/ideas", "POST", { title: "x" }));
    expect(session).toHaveBeenLastCalledWith(expect.anything(), "ideas-api", {
      requiredRole: WorkspaceRole.EDITOR,
    });
  });

  it("a body that is not JSON is a 400", async () => {
    const res = await create(
      new NextRequest(url("/api/ideas"), { method: "POST", body: "{nope" })
    );
    expect(res.status).toBe(400);
  });
});

describe("the connector door: /api/connect/ideas", () => {
  it("creates with source agent, lists, converts and reads cards with a token", async () => {
    const created = await connectCreate(
      req("/api/connect/ideas", "POST", { title: "Try the new editor" })
    );
    expect(created.status).toBe(200);
    const id = (await created.json()).result.task.id as string;
    expect(taskRow(db, id).ideaSource).toBe("agent");
    expect(token).toHaveBeenLastCalledWith(
      expect.anything(),
      WorkspaceRole.EDITOR
    );

    const listed = await (await connectList(req("/api/connect/ideas"))).json();
    expect(listed.result.ideas).toHaveLength(1);
    expect(token).toHaveBeenLastCalledWith(
      expect.anything(),
      WorkspaceRole.VIEWER
    );

    const cardsRes = await (
      await connectCards(req("/api/connect/ideas/cards?visibleTasks=4"))
    ).json();
    expect(cardsRes.result.cards).toHaveLength(1);

    const back = await connectConvert(
      req(`/api/connect/ideas/${id}/convert`, "POST", { to: "task" }),
      idParams(id)
    );
    expect(back.status).toBe(200);
    expect(taskRow(db, id).kind).toBe("TASK");
  });

  it("answers a missing token as the connector does", async () => {
    token.mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as never);
    expect((await connectList(req("/api/connect/ideas"))).status).toBe(401);
  });
});
