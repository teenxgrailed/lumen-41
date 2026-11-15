/**
 * Tasks: Overdue is oldest-first whatever the sort, Today rows do not repeat
 * their due date, and the Overdue section carries "Move to today".
 */
import type { V3Project, V3Task } from "@/lib/needt3/map";
import { DEFAULT_TASK_VIEW } from "@/lib/needt3/task-view";

import { hasMoveToToday, hidesDue, workModel } from "../model";

const TODAY = "2026-11-15";

const t = (id: string, patch: Partial<V3Task> = {}): V3Task =>
  ({
    id,
    title: id,
    done: false,
    status: "todo",
    projectId: null,
    dueDate: null,
    scheduledStart: null,
    isFixed: false,
    noSlot: false,
    priority: "medium",
    trashedAt: null,
    repeat: null,
    parts: [],
    ...patch,
  }) as unknown as V3Task;

const projects: V3Project[] = [];
const ids = (l: readonly V3Task[]) => l.map((x) => x.id);

describe("Overdue order", () => {
  // 13 Nov has an hour, 12 Nov has none: by hour alone 13 Nov would lead
  const late = [
    t("n13", { dueDate: "2026-11-13", scheduledStart: "2026-11-13T09:00" }),
    t("n12", { dueDate: "2026-11-12" }),
    t("n12-timed", {
      dueDate: "2026-11-12",
      scheduledStart: "2026-11-12T08:00",
    }),
  ];

  it("lists the oldest due day first, whatever the sort", () => {
    for (const sort of ["time", "due", "priority"] as const) {
      const m = workModel({
        tasks: late,
        projects,
        today: TODAY,
        tab: "today",
        view: { ...DEFAULT_TASK_VIEW, sort },
      });
      expect(m.sections[0].key).toBe("overdue");
      expect(ids(m.sections[0].tasks)).toEqual(["n12-timed", "n12", "n13"]);
    }
  });

  it("keeps that order when Overdue is lifted out of a grouping", () => {
    const m = workModel({
      tasks: late,
      projects,
      today: TODAY,
      tab: "today",
      view: { ...DEFAULT_TASK_VIEW, group: "priority" },
    });
    expect(m.sections[0].key).toBe("overdue");
    expect(ids(m.sections[0].tasks)).toEqual(["n12-timed", "n12", "n13"]);
  });
});

describe("Today rows and the Overdue action", () => {
  it("hides the due date only for rows due today on the Today tab", () => {
    expect(hidesDue("today", false, t("a", { dueDate: TODAY }), TODAY)).toBe(
      true
    );
    // overdue rows keep their date
    expect(
      hidesDue("today", false, t("a", { dueDate: "2026-11-13" }), TODAY)
    ).toBe(false);
    // other tabs and Projects keep it too
    expect(hidesDue("all", false, t("a", { dueDate: TODAY }), TODAY)).toBe(
      false
    );
    expect(hidesDue("today", true, t("a", { dueDate: TODAY }), TODAY)).toBe(
      false
    );
  });

  it("puts Move to today on the Overdue section of Tasks, not Projects", () => {
    expect(hasMoveToToday("overdue", false)).toBe(true);
    expect(hasMoveToToday("today", false)).toBe(false);
    expect(hasMoveToToday("overdue", true)).toBe(false);
  });
});
