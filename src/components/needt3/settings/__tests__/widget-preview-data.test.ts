import {
  arcSun,
  pixelLevels,
  previewDay,
  sampleDay,
} from "../widget-preview-data";

const NOW = new Date("2026-10-27T14:20:00.000Z");

describe("widget preview data", () => {
  it("falls back to the lab's week when there are no tasks for today", () => {
    const d = previewDay([], NOW, "UTC");
    expect(d.real).toBe(false);
    expect(d.tasks).toHaveLength(6);
    expect(d.left).toBe(4);
    expect(d.done).toBe(2);
    expect(d.clock).toBe("14:20");
    expect(d.weekday).toBe("Tuesday");
  });

  it("uses today's own tasks: the last finished one, then the open ones", () => {
    const d = previewDay(
      [
        {
          title: "Done early",
          status: "completed",
          scheduledStart: "2026-10-27T08:00:00.000Z",
        },
        {
          title: "Done later",
          status: "completed",
          scheduledStart: "2026-10-27T09:00:00.000Z",
        },
        {
          title: "Call the bank",
          status: "todo",
          scheduledStart: "2026-10-27T16:30:00.000Z",
        },
        {
          title: "Write",
          status: "todo",
          scheduledStart: "2026-10-27T15:00:00.000Z",
        },
        {
          title: "Tomorrow",
          status: "todo",
          scheduledStart: "2026-10-28T10:00:00.000Z",
        },
      ],
      NOW,
      "UTC"
    );
    expect(d.real).toBe(true);
    expect(d.tasks.map((t) => t.title)).toEqual([
      "Done later",
      "Write",
      "Call the bank",
    ]);
    expect(d.tasks[1].time).toBe("15:00");
    expect(d.left).toBe(2);
    expect(d.done).toBe(1);
  });

  it("ignores rows that are not tasks", () => {
    const d = previewDay([null, { title: 5 }, { title: " " }], NOW, "UTC");
    expect(d.real).toBe(false);
  });

  it("keeps the sample day complete", () => {
    expect(sampleDay().tasks.every((t) => t.title && t.time)).toBe(true);
  });

  it("puts the sun on its arc and moves it across the day", () => {
    const early = arcSun(0, 150, 158, 0.3, 1.32);
    const late = arcSun(1, 150, 158, 0.3, 1.32);
    expect(early.left).toBeLessThan(late.left);
    const noon = arcSun(0.5, 150, 158, 0.3, 1.32);
    expect(noon.top).toBeLessThan(early.top);
  });

  it("marks now and the tasks on the 15-minute strip", () => {
    const cells = pixelLevels(
      [{ title: "A", time: "09:00", done: false, color: "#000" }],
      "14:20"
    );
    expect(cells).toHaveLength(52);
    expect(cells[4]).toBe(2);
    expect(cells[5]).toBe(2);
    expect(cells[25]).toBe(-1);
  });
});
