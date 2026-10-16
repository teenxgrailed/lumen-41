import { taskFromApi, taskPatchToApi } from "../map";
import {
  REPEAT_CHOICES,
  buildRule,
  readCustom,
  repeatKey,
  repeatLabel,
} from "../repeat";

const TZ = "Europe/Kyiv";
const row = { id: "t1", title: "Write", status: "todo" };

describe("No priority", () => {
  it("reads the legacy column, ahead of the level", () => {
    expect(
      taskFromApi({ ...row, priority: "none", priorityLevel: "HIGH" }, TZ)
        .priority
    ).toBe("none");
    expect(
      taskFromApi({ ...row, priority: "high", priorityLevel: "LOW" }, TZ)
        .priority
    ).toBe("low");
    expect(taskFromApi({ ...row, priorityLevel: "URGENT" }, TZ).priority).toBe(
      "urgent"
    );
  });

  it("writes none to the legacy column only, and a real priority ends it", () => {
    expect(taskPatchToApi({ priority: "none" }, TZ)).toEqual({
      priority: "none",
    });
    expect(taskPatchToApi({ priority: "high" }, TZ)).toEqual({
      priorityLevel: "HIGH",
      priority: null,
    });
  });
});

describe("labels, repeat, files, created and where a task came from", () => {
  it("maps tags to labels and writes the whole set as tagIds", () => {
    const t = taskFromApi(
      { ...row, tags: [{ id: "a", name: "Deep work", color: "#123456" }] },
      TZ
    );
    expect(t.labels).toEqual([
      { id: "a", name: "Deep work", color: "#123456" },
    ]);
    expect(taskPatchToApi({ labels: t.labels }, TZ)).toEqual({ tagIds: ["a"] });
    expect(taskPatchToApi({ labels: [] }, TZ)).toEqual({ tagIds: [] });
  });

  it("writes the repeat with its flag, so a rule alone makes a series", () => {
    expect(taskPatchToApi({ repeat: "FREQ=DAILY" }, TZ)).toEqual({
      recurrenceRule: "FREQ=DAILY",
      isRecurring: true,
    });
    expect(taskPatchToApi({ repeat: null }, TZ)).toEqual({
      recurrenceRule: null,
      isRecurring: false,
    });
    expect(
      taskFromApi(
        { ...row, isRecurring: false, recurrenceRule: "FREQ=DAILY" },
        TZ
      ).repeat
    ).toBeNull();
  });

  it("lists files with where to read them, and keeps created", () => {
    const t = taskFromApi(
      {
        ...row,
        createdAt: "2026-09-04T08:00:00.000Z",
        attachments: [
          { id: "f1", name: "a.pdf", mimeType: "application/pdf", size: 9 },
        ],
      },
      TZ
    );
    expect(t.createdAt).toBe("2026-09-04T08:00:00.000Z");
    expect(t.attachments).toEqual([
      {
        id: "f1",
        name: "a.pdf",
        mimeType: "application/pdf",
        size: 9,
        url: "/api/tasks/t1/attachments/f1",
      },
    ]);
  });

  it("says which provider a task came from, not for tasks made here or switched off", () => {
    expect(
      taskFromApi({ ...row, source: "OUTLOOK", externalTaskId: "x" }, TZ)
        .syncedFrom
    ).toBe("outlook");
    expect(
      taskFromApi({ ...row, source: "OUTLOOK" }, TZ).syncedFrom
    ).toBeNull();
    expect(
      taskFromApi(
        { ...row, source: "GOOGLE", externalTaskId: "x", skipSync: true },
        TZ
      ).syncedFrom
    ).toBeNull();
    expect(taskFromApi(row, TZ).syncedFrom).toBeNull();
  });
});

describe("repeat choices", () => {
  it("recognises each choice however the rule is spelled", () => {
    for (const c of REPEAT_CHOICES) {
      if (c.rule) expect(repeatKey(c.rule)).toBe(c.key);
    }
    expect(repeatKey("RRULE:FREQ=DAILY;INTERVAL=1")).toBe("daily");
    expect(repeatKey("FREQ=WEEKLY;BYDAY=FR,MO,TH,TU,WE")).toBe("weekdays");
    expect(repeatKey(null)).toBeNull();
    expect(repeatKey("")).toBeNull();
  });

  it("keeps any other rule as custom", () => {
    expect(repeatKey("FREQ=WEEKLY;BYDAY=MO")).toBe("custom");
    expect(repeatKey("FREQ=DAILY;INTERVAL=2")).toBe("custom");
    expect(repeatLabel("FREQ=DAILY;INTERVAL=2")).toBe("Every 2 days");
    expect(repeatLabel("FREQ=YEARLY")).toBe("Custom");
    expect(repeatLabel("FREQ=MONTHLY")).toBe("Every month");
    expect(repeatLabel(null)).toBeNull();
  });
});

describe("custom repeat", () => {
  it("builds a rule the preset logic and the server both read", () => {
    expect(buildRule({ freq: "DAILY", interval: 1, days: [] })).toBe(
      "FREQ=DAILY"
    );
    expect(buildRule({ freq: "WEEKLY", interval: 1, days: ["WE", "MO"] })).toBe(
      "FREQ=WEEKLY;BYDAY=MO,WE"
    );
    expect(buildRule({ freq: "WEEKLY", interval: 2, days: [] })).toBe(
      "FREQ=WEEKLY;INTERVAL=2"
    );
    expect(buildRule({ freq: "MONTHLY", interval: 0, days: ["MO"] })).toBe(
      "FREQ=MONTHLY"
    );
    expect(buildRule({ freq: "DAILY", interval: 500, days: [] })).toBe(
      "FREQ=DAILY;INTERVAL=99"
    );
  });

  it("reads back what it wrote, and nothing it did not", () => {
    const c = { freq: "WEEKLY" as const, interval: 2, days: ["TU" as const] };
    expect(readCustom(buildRule(c))).toEqual(c);
    expect(readCustom("FREQ=YEARLY")).toBeNull();
    expect(readCustom("FREQ=WEEKLY;COUNT=3")).toBeNull();
    expect(readCustom("FREQ=DAILY;BYDAY=MO")).toBeNull();
  });

  it("names days and intervals", () => {
    expect(repeatLabel("FREQ=WEEKLY;BYDAY=MO,WE")).toBe("Mon, Wed");
    expect(repeatLabel("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU")).toBe(
      "Every 2 weeks · Tue"
    );
  });
});
