import { NextRequest } from "next/server";

import { POST as toggle } from "@/app/api/connect/habits/[id]/toggle-today/route";
import { GET as getHabits } from "@/app/api/connect/habits/today/route";
import { GET as getHighlight } from "@/app/api/connect/highlight/route";
import { GET as getToday } from "@/app/api/connect/today/route";
import { authenticateBearer } from "@/services/connectors/bearer";
import {
  dayFor,
  freeMinutesIn,
  todayView,
  weekStartKey,
  workWindow,
} from "@/services/connectors/today";
import { weatherFor } from "@/services/weather/open-meteo";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { getEmailVerificationStatus } from "@/lib/auth/email-verification-access";
import {
  WorkspaceAuthorizationError,
  resolveWorkspaceAccess,
} from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

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
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEventSafe: jest.fn(),
}));
// Writes are rate limited per person; the limiter needs Redis.
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: () => ({}),
  enforceRateLimits: async () => null,
}));
jest.mock("@/services/weather/open-meteo", () => ({
  cleanCity: (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null,
  weatherFor: jest.fn().mockResolvedValue({
    city: "Tokyo",
    temp: 3,
    min: 1,
    max: 6,
    code: 61,
    summary: "Rain",
  }),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    connectorSettings: { findUnique: jest.fn() },
    userSettings: { findUnique: jest.fn() },
    calendarSettings: { findUnique: jest.fn() },
    habit: { findMany: jest.fn() },
    habitCompletion: { findUnique: jest.fn() },
    task: { findMany: jest.fn(), count: jest.fn() },
    dailyHighlight: { findUnique: jest.fn() },
    calendarEvent: { findMany: jest.fn() },
    personalBlock: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const db = prisma as unknown as {
  userSettings: { findUnique: jest.Mock };
  calendarSettings: { findUnique: jest.Mock };
  habit: { findMany: jest.Mock };
  habitCompletion: { findUnique: jest.Mock };
  task: { findMany: jest.Mock; count: jest.Mock };
  dailyHighlight: { findUnique: jest.Mock };
  calendarEvent: { findMany: jest.Mock };
  personalBlock: { findMany: jest.Mock };
  $transaction: jest.Mock;
};

function req(path: string, method = "GET", body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      authorization: "Bearer needt_token",
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function unauthenticated(path: string) {
  return new NextRequest(`http://localhost${path}`);
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const workspace = (kind: WorkspaceKind = WorkspaceKind.PERSONAL) => ({
  enabled: true,
  workspaceId: "workspace-1",
  workspaceKind: kind,
  role: WorkspaceRole.OWNER,
  dataScope: { mode: "workspace" as const, workspaceId: "workspace-1" },
});

function asPersonalToken() {
  jest.mocked(authenticateBearer).mockResolvedValue({
    userId: "user-1",
    kind: "personal",
    scopes: ["needt.read", "needt.write"],
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest
    .mocked(getEmailVerificationStatus)
    .mockResolvedValue({ required: false, verified: true } as never);
  jest.mocked(weatherFor).mockResolvedValue({
    city: "Tokyo",
    temp: 3,
    min: 1,
    max: 6,
    code: 61,
    summary: "Rain",
  });
  jest.mocked(resolveWorkspaceAccess).mockResolvedValue(workspace());
  db.userSettings.findUnique.mockResolvedValue({
    timeZone: "UTC",
    weekStartDay: "monday",
    prefs: {},
  });
  db.calendarSettings.findUnique.mockResolvedValue(null);
  db.habit.findMany.mockResolvedValue([]);
  db.task.findMany.mockResolvedValue([]);
  db.task.count.mockResolvedValue(0);
  db.dailyHighlight.findUnique.mockResolvedValue(null);
  db.calendarEvent.findMany.mockResolvedValue([]);
  db.personalBlock.findMany.mockResolvedValue([]);
  asPersonalToken();
});

describe("auth on the widget routes", () => {
  it.each([
    ["today", () => getToday(unauthenticated("/api/connect/today"))],
    [
      "habits/today",
      () => getHabits(unauthenticated("/api/connect/habits/today")),
    ],
    [
      "highlight",
      () => getHighlight(unauthenticated("/api/connect/highlight")),
    ],
  ])("%s refuses a call with no token", async (_name, call) => {
    jest.mocked(authenticateBearer).mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBeTruthy();
    expect(db.task.findMany).not.toHaveBeenCalled();
  });

  it("answers a personal token on every read", async () => {
    expect((await getToday(req("/api/connect/today"))).status).toBe(200);
    expect((await getHabits(req("/api/connect/habits/today"))).status).toBe(
      200
    );
    expect((await getHighlight(req("/api/connect/highlight"))).status).toBe(
      200
    );
  });

  it("lets a read-only grant read but not tick a habit", async () => {
    jest.mocked(authenticateBearer).mockResolvedValue({
      userId: "user-1",
      kind: "oauth",
      scopes: ["needt.read"],
      workspaceId: "workspace-1",
    });
    expect((await getToday(req("/api/connect/today"))).status).toBe(200);
    const response = await toggle(
      req("/api/connect/habits/h1/toggle-today", "POST", {}),
      params("h1")
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "insufficient_scope",
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a viewer who tries to tick a habit", async () => {
    jest
      .mocked(resolveWorkspaceAccess)
      .mockRejectedValue(
        new WorkspaceAuthorizationError(
          "Role required",
          403,
          "WORKSPACE_ROLE_REQUIRED"
        )
      );
    const response = await toggle(
      req("/api/connect/habits/h1/toggle-today", "POST"),
      params("h1")
    );
    expect(response.status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a malformed highlight date", async () => {
    const response = await getHighlight(
      req("/api/connect/highlight?date=18-10-2026")
    );
    expect(response.status).toBe(400);
  });
});

describe("scoping", () => {
  it("keeps an OAuth grant inside its bound workspace", async () => {
    jest.mocked(authenticateBearer).mockResolvedValue({
      userId: "user-1",
      kind: "oauth",
      scopes: ["needt.read"],
      workspaceId: "workspace-1",
    });
    const response = await getToday(
      req("/api/connect/today?workspaceId=workspace-2")
    );
    expect(response.status).toBe(403);
    expect(db.task.findMany).not.toHaveBeenCalled();
  });

  it("reads only the caller's workspace and own habits", async () => {
    await getHabits(req("/api/connect/habits/today"));
    expect(db.habit.findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId: "workspace-1",
      userId: "user-1",
      archivedAt: null,
      isActive: true,
    });
    await getToday(req("/api/connect/today"));
    for (const [arg] of db.task.findMany.mock.calls) {
      expect(arg.where).toMatchObject({
        workspaceId: "workspace-1",
        trashedAt: null,
      });
    }
    expect(db.task.count.mock.calls[0][0].where).toMatchObject({
      workspaceId: "workspace-1",
    });
    expect(db.calendarEvent.findMany.mock.calls[0][0].where.feed).toEqual({
      userId: "user-1",
      enabled: true,
    });
  });

  it("reads the highlight of the caller's own workspace and day", async () => {
    await getHighlight(req("/api/connect/highlight?date=2026-10-18"));
    expect(db.dailyHighlight.findUnique.mock.calls[0][0].where).toEqual({
      userId_workspaceId_date: {
        userId: "user-1",
        workspaceId: "workspace-1",
        date: "2026-10-18",
      },
    });
  });

  it("sends no calendar events from a shared workspace", async () => {
    jest
      .mocked(resolveWorkspaceAccess)
      .mockResolvedValue(workspace(WorkspaceKind.SHARED));
    const response = await getToday(req("/api/connect/today"));
    const body = await response.json();
    expect(body.event).toBeNull();
    expect(db.calendarEvent.findMany).not.toHaveBeenCalled();
  });

  it("answers 404 for a habit that is not the caller's", async () => {
    db.$transaction.mockImplementation(async (fn) =>
      fn({
        habitCompletion: { findUnique: jest.fn().mockResolvedValue(null) },
        habit: { findFirst: jest.fn().mockResolvedValue(null) },
      })
    );
    const response = await toggle(
      req("/api/connect/habits/other/toggle-today", "POST"),
      params("other")
    );
    expect(response.status).toBe(404);
  });
});

describe("habits and the person's day", () => {
  // 2026-10-18 23:30 UTC is already the 19th (Monday) in Kiritimati (UTC+14)
  // and still the 18th (Sunday) in Los Angeles.
  const instant = new Date("2026-10-18T23:30:00Z");

  it("computes the day in the saved zone, not the server's", () => {
    expect(dayFor(instant, "Pacific/Kiritimati").date).toBe("2026-10-19");
    expect(dayFor(instant, "America/Los_Angeles").date).toBe("2026-10-18");
    expect(dayFor(instant, "Pacific/Kiritimati").weekday).toBe(1);
    expect(dayFor(instant, "America/Los_Angeles").weekday).toBe(0);
    expect(dayFor(instant, "Not/AZone").date).toBe("2026-10-18");
  });

  it("bounds the day at the zone's midnights", () => {
    const day = dayFor(instant, "America/Los_Angeles");
    expect(day.start.toISOString()).toBe("2026-10-18T07:00:00.000Z");
    expect(day.end.toISOString()).toBe("2026-10-19T07:00:00.000Z");
  });

  it("keeps a clock-change day at 25 hours", () => {
    // Los Angeles ends DST on 2026-11-01.
    const day = dayFor(new Date("2026-11-01T20:00:00Z"), "America/Los_Angeles");
    expect((day.end.getTime() - day.start.getTime()) / 3_600_000).toBe(25);
  });

  it("starts the week on the person's day", () => {
    expect(weekStartKey("2026-10-18", 1)).toBe("2026-10-12");
    expect(weekStartKey("2026-10-18", 0)).toBe("2026-10-18");
    expect(weekStartKey("2026-10-19", 1)).toBe("2026-10-19");
  });

  it("marks a habit done on the person's day and counts the week", async () => {
    jest.useFakeTimers().setSystemTime(instant);
    try {
      db.userSettings.findUnique.mockResolvedValue({
        timeZone: "Pacific/Kiritimati",
        weekStartDay: "monday",
      });
      db.habit.findMany.mockResolvedValue([
        {
          id: "h1",
          title: "Walk",
          icon: "🚶",
          color: null,
          daysOfWeek: [],
          targetOccurrencesPerWeek: 3,
          quota: null,
          at: null,
          completions: [{ date: new Date("2026-10-19T00:00:00Z") }],
        },
        {
          id: "h2",
          title: "Gym",
          icon: null,
          color: null,
          daysOfWeek: [2, 4],
          targetOccurrencesPerWeek: 2,
          quota: null,
          at: "18:00",
          completions: [],
        },
      ]);
      const body = await (
        await getHabits(req("/api/connect/habits/today"))
      ).json();
      expect(body.date).toBe("2026-10-19");
      // The query window is the person's week, Monday 19th through today.
      const where = db.habit.findMany.mock.calls[0][0].select.completions.where;
      expect(where.date.gte.toISOString()).toBe("2026-10-19T00:00:00.000Z");
      expect(where.date.lte.toISOString()).toBe("2026-10-19T00:00:00.000Z");
      expect(body.habits[0]).toMatchObject({
        id: "h1",
        icon: "🚶",
        kind: "weekly",
        doneToday: true,
        todayCount: 1,
        scheduledToday: true,
        week: { start: "2026-10-19", done: 1, target: 3 },
      });
      // Monday: Gym is a Tue/Thu habit.
      expect(body.habits[1]).toMatchObject({
        kind: "days",
        doneToday: false,
        scheduledToday: false,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("flips today's check-in in the person's zone", async () => {
    jest.useFakeTimers().setSystemTime(instant);
    try {
      db.userSettings.findUnique.mockResolvedValue({
        timeZone: "Pacific/Kiritimati",
      });
      const upsert = jest.fn();
      const tx = {
        habitCompletion: {
          findUnique: jest
            .fn()
            // toggleHabitToday reads, then setHabitCompletion reads again.
            .mockResolvedValue(null),
          upsert,
          deleteMany: jest.fn(),
        },
        habit: { findFirst: jest.fn().mockResolvedValue({ id: "h1" }) },
      };
      db.$transaction.mockImplementation(async (fn) => fn(tx));
      const response = await toggle(
        req("/api/connect/habits/h1/toggle-today", "POST"),
        params("h1")
      );
      await expect(response.json()).resolves.toEqual({
        habitId: "h1",
        date: "2026-10-19",
        completed: true,
      });
      expect(upsert.mock.calls[0][0].create.date.toISOString()).toBe(
        "2026-10-19T00:00:00.000Z"
      );
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("free minutes", () => {
  const at = (hm: string) => new Date(`2026-10-19T${hm}:00Z`);

  it("counts overlapping busy time once", () => {
    expect(
      freeMinutesIn(at("09:00"), at("17:00"), [
        { start: at("10:00"), end: at("11:00") },
        { start: at("10:30"), end: at("12:00") },
        { start: at("16:00"), end: at("18:00") },
      ])
    ).toBe(8 * 60 - 120 - 60);
  });

  it("is zero past the end of the window", () => {
    expect(freeMinutesIn(at("18:00"), at("17:00"), [])).toBe(0);
  });

  it("uses the working hours of the day's weekday in the person's zone", () => {
    const monday = dayFor(new Date("2026-10-19T12:00:00Z"), "Europe/Kyiv");
    const window = workWindow(monday, {
      workingHoursEnabled: true,
      workingHoursStart: "09:00",
      workingHoursEnd: "17:00",
      workingHoursDays: "[1,2,3,4,5]",
    });
    // Kyiv is UTC+3 on 2026-10-19.
    expect(window?.start.toISOString()).toBe("2026-10-19T06:00:00.000Z");
    const sunday = dayFor(new Date("2026-10-18T12:00:00Z"), "Europe/Kyiv");
    expect(workWindow(sunday, null)).toBeNull();
  });
});

describe("GET /api/connect/today", () => {
  const now = new Date("2026-10-19T08:00:00Z");

  it("builds counts, next task, highlight, event, personal time and weather", async () => {
    db.userSettings.findUnique.mockResolvedValue({
      timeZone: "UTC",
      weekStartDay: "monday",
      prefs: { city: "Tokyo" },
    });
    db.task.count.mockResolvedValue(2);
    db.task.findMany.mockResolvedValue([
      {
        id: "late",
        title: "Past slot",
        dueDate: null,
        duration: 30,
        estimatedMinutes: null,
        scheduledStart: at("07:00"),
        scheduledEnd: at("07:30"),
        scheduledBlocks: [{ start: at("07:00"), end: at("07:30") }],
      },
      {
        id: "next",
        title: "Write the brief",
        dueDate: null,
        duration: null,
        estimatedMinutes: null,
        scheduledStart: at("11:00"),
        scheduledEnd: at("12:00"),
        scheduledBlocks: [{ start: at("11:00"), end: at("12:00") }],
      },
      {
        id: "overdue",
        title: "Overdue",
        dueDate: new Date("2026-10-17T10:00:00Z"),
        duration: 15,
        estimatedMinutes: null,
        scheduledStart: null,
        scheduledEnd: null,
        scheduledBlocks: [],
      },
      {
        // A slot tomorrow, no deadline: not today's.
        id: "tomorrow",
        title: "Tomorrow",
        dueDate: null,
        duration: 15,
        estimatedMinutes: null,
        scheduledStart: new Date("2026-10-20T09:00:00Z"),
        scheduledEnd: new Date("2026-10-20T09:15:00Z"),
        scheduledBlocks: [],
      },
    ]);
    db.dailyHighlight.findUnique.mockResolvedValue({
      date: "2026-10-19",
      taskId: "next",
      task: {
        id: "next",
        title: "Write the brief",
        status: "todo",
        dueDate: null,
        estimatedMinutes: null,
        duration: 60,
        scheduledStart: at("11:00"),
        scheduledEnd: at("12:00"),
        trashedAt: null,
      },
    });
    db.calendarEvent.findMany.mockResolvedValue([
      {
        id: "e0",
        title: "Cancelled",
        start: at("09:00"),
        end: at("10:00"),
        location: null,
        allDay: false,
        status: "cancelled",
      },
      {
        id: "e1",
        title: "Standup",
        start: at("13:00"),
        end: at("13:30"),
        location: "Zoom",
        allDay: false,
        status: "confirmed",
      },
    ]);
    db.personalBlock.findMany.mockResolvedValue([
      {
        id: "p1",
        kind: "lunch",
        title: "Lunch",
        emoji: "🍽",
        color: null,
        start: at("13:00"),
        end: at("14:00"),
        rrule: null,
        sourceEventId: null,
      },
    ]);

    const body = await todayView(
      { userId: "user-1", workspace: workspace() },
      now
    );

    expect(body.counts).toEqual({ open: 3, done: 2, total: 5 });
    expect(body.next).toMatchObject({
      id: "next",
      title: "Write the brief",
      start: "2026-10-19T11:00:00.000Z",
      durationMinutes: 60,
      href: "/tasks?task=next",
    });
    expect(body.tasks.map((t) => t.id)).toEqual(["next", "overdue", "late"]);
    expect(body.highlight).toMatchObject({
      taskId: "next",
      done: false,
      start: "2026-10-19T11:00:00.000Z",
    });
    expect(body.event).toMatchObject({ title: "Standup", location: "Zoom" });
    expect(body.personalBlock).toMatchObject({ title: "Lunch", emoji: "🍽" });
    // 09:00-17:00 window: 11-12 task, 13-14 lunch (the 13-13:30 event sits
    // inside it, counted once); the 07:00 slot is outside the window.
    expect(body.freeMinutes).toBe(8 * 60 - 60 - 60);
    expect(body.workLeftMinutes).toBe(8 * 60);
    expect(body.weather).toMatchObject({
      city: "Tokyo",
      line: "3° Rain in Tokyo",
    });
  });

  it("omits the weather when no City is saved", async () => {
    const body = await todayView(
      { userId: "user-1", workspace: workspace() },
      now
    );
    expect(body.weather).toBeNull();
    expect(body.next).toBeNull();
    expect(body.highlight).toBeNull();
  });

  function at(hm: string) {
    return new Date(`2026-10-19T${hm}:00Z`);
  }
});
