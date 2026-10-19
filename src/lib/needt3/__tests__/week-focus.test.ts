import { TODAY, task } from "@/components/needt3/home/__tests__/fixtures";

import { focusTasks, nextWeekStart, weekStartOf } from "../week-focus";

describe("weekStartOf", () => {
  it("is the Monday or the Sunday that starts the week", () => {
    // 2026-10-21 is a Wednesday
    expect(weekStartOf("2026-10-21")).toBe("2026-10-19");
    expect(weekStartOf("2026-10-19")).toBe("2026-10-19");
    expect(weekStartOf("2026-10-25")).toBe("2026-10-19");
    expect(weekStartOf("2026-10-21", "sunday")).toBe("2026-10-18");
    expect(weekStartOf("2026-10-18", "sunday")).toBe("2026-10-18");
  });
});

describe("nextWeekStart", () => {
  it("is the week after a Sunday review", () => {
    expect(nextWeekStart("2026-10-25")).toBe("2026-10-26");
    expect(nextWeekStart("2026-10-25", "sunday")).toBe("2026-10-25");
  });
});

describe("focusTasks", () => {
  it("finds a task focus by its id and a project focus by its open tasks", () => {
    const one = task({ title: "Landing v27", projectId: "p-needt" });
    const lek = task({
      title: "Lektion 7",
      projectId: "p-de",
      dueDate: "2026-09-03",
    });
    const lek2 = task({
      title: "Lektion 8",
      projectId: "p-de",
      dueDate: "2026-09-02",
    });
    const lek3 = task({
      title: "Lektion 9",
      projectId: "p-de",
      dueDate: "2026-09-09",
    });
    const other = task({ title: "Unrelated", projectId: "p-x" });
    const list = focusTasks(
      [
        { title: "snapshot", taskId: one.id },
        { title: "German", projectId: "p-de" },
      ],
      [other, lek, lek3, lek2, one]
    );
    expect(list.map((t) => t.title)).toEqual([
      "Landing v27",
      "Lektion 8",
      "Lektion 7",
    ]);
  });

  it("skips closed, trashed and unplaceable tasks, and lists each task once", () => {
    const open = task({ title: "Ship the report", projectId: "p1" });
    const list = focusTasks(
      [
        { title: "a", taskId: open.id },
        { title: "b", projectId: "p1" },
      ],
      [
        task({ title: "Closed", done: true, projectId: "p1" }),
        task({
          title: "Gone",
          trashedAt: `${TODAY}T10:00:00Z`,
          projectId: "p1",
        }),
        task({ title: "Nowhere", noSlot: true, projectId: "p1" }),
        open,
      ]
    );
    expect(list).toEqual([open]);
  });

  it("does not match by title: an old title-only focus points at nothing", () => {
    const t = task({ title: "Go to the dentist" });
    expect(focusTasks([{ title: "dentist" }], [t])).toEqual([]);
    expect(
      focusTasks([{ title: "Go to the dentist", taskId: null }], [t])
    ).toEqual([]);
  });
});
