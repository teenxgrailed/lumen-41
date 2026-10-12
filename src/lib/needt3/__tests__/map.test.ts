/* Round trips for every prototype ↔ column mapping (T03 accept criterion). */
import {
  parseV3Fields,
  taskV3FieldsSchema,
  trashedAtFrom,
} from "@/lib/needt3/api-fields";
import {
  type ApiTask,
  type V3TaskPatch,
  boardFromApi,
  eventFromApi,
  eventPatchToApi,
  eventSourceFromFeedType,
  habitFromApi,
  habitPatchToApi,
  localToIso,
  mailFromApi,
  priorityFromDb,
  priorityToDb,
  projectFromApi,
  projectPatchToApi,
  stageFromDb,
  stageToDb,
  taskFromApi,
  taskPatchToApi,
} from "@/lib/needt3/map";

const TZ = "Europe/Zurich"; // UTC+2 in September

const ROW: ApiTask = {
  id: "t1",
  title: "Draft the launch brief",
  description: "<p>For Monday</p>",
  status: "in_progress",
  dueDate: "2026-09-03T22:00:00.000Z", // 4 Sep, local midnight
  estimatedMinutes: 90,
  scheduledStart: "2026-09-04T07:00:00.000Z", // 09:00 local
  scheduledEnd: "2026-09-04T08:30:00.000Z",
  projectId: "ops",
  scheduleLocked: true,
  isAutoScheduled: false,
  noSlot: false,
  entry: "Open last month's sheet",
  minChunkMinutes: 30,
  splitAllowed: false,
  deadline: "2026-09-05T22:00:00.000Z",
  hardDeadline: true,
  priorityLevel: "URGENT",
  assigneeId: "anna",
  dependsOnId: "t26",
  valueCents: 160000,
  earnedCents: 38050,
  globalStage: "REVIEW",
  previousScheduledStart: "2026-09-03T07:00:00.000Z",
  trashedAt: null,
  originKind: "mail",
  originId: "m1",
  originQuote: "Thursday or Friday?",
  isRecurring: false,
  recurrenceRule: null,
  scheduleId: null,
  updatedAt: "2026-09-01T08:00:00.000Z",
};

describe("task mapping", () => {
  const t = taskFromApi(ROW, TZ);

  it("speaks the prototype's names", () => {
    expect(t).toMatchObject({
      notes: "For Monday",
      done: false,
      dueDate: "2026-09-04",
      scheduledStart: "2026-09-04T09:00",
      scheduledEnd: "2026-09-04T10:30",
      isFixed: true,
      auto: false,
      chunk: 30,
      splitAllowed: false,
      deadline: "2026-09-06",
      priority: "urgent",
      holder: "anna",
      blockedBy: "t26",
      value: 1600,
      earned: 380.5,
      Stage: "review",
      movedFrom: "2026-09-03T09:00",
      source: { kind: "mail", id: "m1", quote: "Thursday or Friday?" },
    });
  });

  it("round-trips every mapped field back to the columns", () => {
    const patch: V3TaskPatch = { ...t };
    for (const k of ["id", "status", "updatedAt", "movedFrom"])
      delete (patch as Record<string, unknown>)[k];
    const body = taskPatchToApi(patch, TZ);
    expect(body).toMatchObject({
      title: ROW.title,
      description: "For Monday",
      dueDate: ROW.dueDate,
      scheduledStart: ROW.scheduledStart,
      scheduledEnd: ROW.scheduledEnd,
      scheduleLocked: true,
      isAutoScheduled: false,
      minChunkMinutes: 30,
      splitAllowed: false,
      deadline: ROW.deadline,
      hardDeadline: true,
      priorityLevel: "URGENT",
      assigneeId: "anna",
      dependsOnId: "t26",
      valueCents: 160000,
      earnedCents: 38050,
      globalStage: "REVIEW",
      originKind: "mail",
      originId: "m1",
      originQuote: "Thursday or Friday?",
      entry: ROW.entry,
      projectId: "ops",
    });
    expect(taskFromApi({ ...ROW, ...body } as ApiTask, TZ)).toMatchObject(
      patch
    );
  });

  it("writes only the keys a patch carries", () => {
    expect(taskPatchToApi({ isFixed: false }, TZ)).toEqual({
      scheduleLocked: false,
    });
    expect(taskPatchToApi({ done: true }, TZ)).toEqual({ status: "completed" });
    expect(taskPatchToApi({ source: null }, TZ)).toEqual({
      originKind: null,
      originId: null,
      originQuote: null,
    });
    expect(taskPatchToApi({ value: null, dueDate: null }, TZ)).toEqual({
      valueCents: null,
      dueDate: null,
    });
  });

  it("reads absent columns as the honest empty", () => {
    const bare = taskFromApi({ id: "x", title: "x", status: "completed" }, TZ);
    expect(bare).toMatchObject({
      done: true,
      isFixed: false,
      splitAllowed: true,
      priority: "medium",
      Stage: null,
      value: null,
      source: null,
      trashedAt: null,
    });
  });

  it.each(["todo", "doing", "review", "done"] as const)(
    "stage %s round-trips",
    (s) => {
      expect(stageFromDb(stageToDb(s))).toBe(s);
    }
  );
  it.each(["urgent", "high", "medium", "low"] as const)(
    "priority %s round-trips",
    (p) => {
      expect(priorityFromDb(priorityToDb(p))).toBe(p);
    }
  );
});

describe("dates", () => {
  it("turns a local day and stamp into UTC in the person's zone", () => {
    expect(localToIso("2026-09-04", TZ)).toBe("2026-09-03T22:00:00.000Z");
    expect(localToIso("2026-09-04T09:00", TZ)).toBe("2026-09-04T07:00:00.000Z");
    expect(localToIso(null, TZ)).toBeNull();
  });
});

describe("project, habit, event, mail and board mapping", () => {
  it("projects round-trip ground, position and archive", () => {
    const p = projectFromApi({
      id: "ops",
      name: "Operations",
      color: "var(--hue-orange)",
      icon: "briefcase",
      ground: "warm",
      position: 2,
      status: "active",
    });
    expect(p).toMatchObject({ ground: "warm", position: 2, archived: false });
    expect(projectPatchToApi({ ground: null, archived: true })).toEqual({
      ground: null,
      status: "archived",
    });
  });

  it("habit schedule ↔ at / quota", () => {
    const h = habitFromApi({
      id: "gym",
      title: "Gym",
      at: "07:00",
      quota: 3,
      color: null,
      icon: "dumbbell",
    });
    expect(h.schedule).toEqual({ time: "07:00", perWeek: 3 });
    expect(habitPatchToApi({ schedule: h.schedule, icon: h.icon })).toEqual({
      at: "07:00",
      quota: 3,
      icon: "dumbbell",
    });
  });

  it("events read local stamps; all-day stays on its UTC day", () => {
    const timed = eventFromApi(
      {
        id: "e",
        title: "Standup",
        start: "2026-09-01T07:30:00.000Z",
        end: "2026-09-01T08:15:00.000Z",
        feedId: "f1",
      },
      TZ,
      "GOOGLE"
    );
    expect(timed).toMatchObject({
      startAt: "2026-09-01T09:30",
      endAt: "2026-09-01T10:15",
      source: "google",
      calendarId: "f1",
    });
    expect(
      eventPatchToApi({ startAt: timed.startAt, endAt: timed.endAt }, TZ)
    ).toEqual({
      start: "2026-09-01T07:30:00.000Z",
      end: "2026-09-01T08:15:00.000Z",
    });
    const allDay = eventFromApi(
      {
        id: "a",
        title: "Offsite",
        start: "2026-09-03T00:00:00.000Z",
        end: "2026-09-05T00:00:00.000Z",
        allDay: true,
        feedId: "f1",
      },
      "America/Los_Angeles"
    );
    expect(allDay).toMatchObject({
      startAt: "2026-09-03T00:00",
      endAt: "2026-09-05T00:00",
      isAllDay: true,
      source: "needt",
    });
    expect(eventSourceFromFeedType("CALDAV")).toBe("apple");
  });

  it("events carry their recurrence; a stored occurrence counts", () => {
    const base = {
      title: "Standup",
      start: "2026-09-01T07:30:00.000Z",
      end: "2026-09-01T08:00:00.000Z",
      feedId: "f1",
    };
    expect(
      eventFromApi(
        { ...base, id: "m", isRecurring: true, recurrenceRule: "FREQ=DAILY" },
        TZ
      )
    ).toMatchObject({ isRecurring: true, recurrenceRule: "FREQ=DAILY" });
    expect(
      eventFromApi({ ...base, id: "i", masterEventId: "m" }, TZ)
    ).toMatchObject({ isRecurring: true, recurrenceRule: null });
    expect(eventFromApi({ ...base, id: "o" }, TZ)).toMatchObject({
      isRecurring: false,
    });
  });

  it("mail reads a message as a thread", () => {
    const m = mailFromApi(
      {
        id: "m1",
        accountId: "a1",
        subject: "Berlin pickup",
        fromName: "Jonas Weber",
        fromAddress: "jonas@example.de",
        snippet: "Hi…",
        date: "2026-09-01T07:12:00.000Z",
        isRead: false,
        isArchived: false,
        needsReply: true,
        toAddresses: [{ address: "me@example.ch" }],
        ccAddresses: ["cc@example.ch"],
        attachments: [
          { name: "proof.pdf", size: 2400000, type: "application/pdf" },
        ],
      },
      TZ
    );
    expect(m).toMatchObject({
      from: "Jonas Weber",
      receivedAt: "2026-09-01T09:12",
      needsReply: true,
      to: ["me@example.ch"],
      cc: ["cc@example.ch"],
      bcc: [],
      attachments: [
        { name: "proof.pdf", size: 2400000, type: "application/pdf" },
      ],
      trashedAt: null,
    });
  });

  it("boards default the new columns", () => {
    expect(boardFromApi({ id: "b", title: "Moods" })).toMatchObject({
      linkShare: false,
      projectId: null,
      trashedAt: null,
    });
  });
});

describe("api fields", () => {
  it("accepts the new task fields and converts the date", () => {
    const r = parseV3Fields(taskV3FieldsSchema, {
      title: "ignored here",
      trashedAt: "2026-09-01T10:00:00.000Z",
      originKind: "doc",
      splitAllowed: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.trashedAt).toBeInstanceOf(Date);
      expect(r.data).not.toHaveProperty("title");
      expect(r.data.originKind).toBe("doc");
    }
  });

  it("rejects a bad value with the field's name", () => {
    const r = parseV3Fields(taskV3FieldsSchema, { originKind: "fax" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/originKind/);
  });

  it("maps trashed to trashedAt", () => {
    expect(trashedAtFrom(undefined)).toBeUndefined();
    expect(trashedAtFrom(false)).toBeNull();
    expect(trashedAtFrom(true)).toBeInstanceOf(Date);
  });
});
