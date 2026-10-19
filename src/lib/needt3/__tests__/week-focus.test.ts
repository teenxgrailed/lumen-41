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
  it("finds a focus by id, else by its title", () => {
    const byId = task({ title: "Landing v27" });
    const byTitle = task({ title: "German B1 — Lektion 7" });
    const none = task({ title: "Unrelated" });
    const list = focusTasks(
      [
        { title: "whatever the title says", taskId: byId.id },
        { title: "german b1", taskId: null },
      ],
      [none, byTitle, byId]
    );
    expect(list.map((t) => t.id)).toEqual([byId.id, byTitle.id]);
  });

  it("skips closed, trashed and unplaceable tasks, and lists each task once", () => {
    const open = task({ title: "Ship the report" });
    const list = focusTasks(
      [
        { title: "Ship the report", taskId: open.id },
        { title: "ship the report", taskId: null },
      ],
      [
        task({ title: "Ship the report", done: true }),
        task({ title: "Ship the report", trashedAt: `${TODAY}T10:00:00Z` }),
        task({ title: "Ship the report", noSlot: true }),
        open,
      ]
    );
    expect(list).toEqual([open]);
  });

  it("does not match a short word inside a longer title", () => {
    const t = task({ title: "Go to the dentist" });
    expect(focusTasks([{ title: "go", taskId: null }], [t])).toEqual([]);
    expect(focusTasks([{ title: "dentist", taskId: null }], [t])).toEqual([t]);
  });
});
