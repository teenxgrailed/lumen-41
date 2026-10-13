import type { V3Task } from "@/lib/needt3/map";
import { tickClosesTask } from "@/lib/needt3/steps";

import {
  blockedIds,
  closingLine,
  flowOrder,
  flowSteps,
  waitsOn,
} from "../flow";
import { projectGroups } from "../model";

const t = (id: string, over: Partial<V3Task> = {}) =>
  ({
    id,
    title: id,
    done: false,
    projectId: "p",
    dueDate: null,
    scheduledStart: null,
    scheduledEnd: null,
    isFixed: false,
    noSlot: false,
    entry: null,
    blockedBy: null,
    parts: [],
    waits: [],
    estimatedMinutes: 30,
    ...over,
  }) as unknown as V3Task;

const part = (id: string, done = false) => ({ id, title: id, done });

describe("flowSteps", () => {
  it("is null without subtasks, so the row is drawn alone", () => {
    expect(flowSteps(t("a", { entry: "Start" }))).toBeNull();
  });

  it("counts the subtasks in the order given and trims the first step", () => {
    expect(
      flowSteps(
        t("a", {
          entry: "  Open it ",
          parts: [part("x", true), part("y"), part("z")],
        })
      )
    ).toMatchObject({
      entry: "Open it",
      total: 3,
      done: 1,
      open: 2,
      parts: [{ id: "x" }, { id: "y" }, { id: "z" }],
    });
    expect(flowSteps(t("a", { entry: "  ", parts: [part("x")] }))?.entry).toBe(
      null
    );
  });

  it("says what is left, then that the task is the only step left", () => {
    expect(closingLine({ done: 1, total: 3, open: 2 })).toBe(
      "Last step · 1 of 3 done"
    );
    expect(closingLine({ done: 3, total: 3, open: 0 })).toBe(
      "Last step · everything above is done"
    );
  });
});

describe("tickClosesTask", () => {
  const task = t("a", { parts: [part("x", true), part("y"), part("z")] });

  it("only the last open step closes the task", () => {
    expect(tickClosesTask(task, "y")).toBe(false);
    const one = t("a", { parts: [part("x", true), part("y")] });
    expect(tickClosesTask(one, "y")).toBe(true);
  });

  it("never closes on an untick, on a done task, or on an unknown step", () => {
    const one = t("a", { parts: [part("x", true), part("y")] });
    expect(tickClosesTask(one, "x")).toBe(false);
    expect(tickClosesTask({ ...one, done: true }, "y")).toBe(false);
    expect(tickClosesTask(one, "nope")).toBe(false);
    expect(tickClosesTask(t("b"), "y")).toBe(false);
  });
});

describe("flowOrder", () => {
  it("puts a blocker before what it blocks and keeps the rest in place", () => {
    const list = [
      t("c", { blockedBy: "b" }),
      t("a"),
      t("b", { blockedBy: "a" }),
      t("d"),
    ];
    expect(flowOrder(list).map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("leaves a task alone when its blocker is not in the list", () => {
    const list = [t("x", { blockedBy: "elsewhere" }), t("y")];
    expect(flowOrder(list).map((x) => x.id)).toEqual(["x", "y"]);
  });

  it("does not hang on a loop", () => {
    const list = [t("a", { blockedBy: "b" }), t("b", { blockedBy: "a" })];
    expect(
      flowOrder(list)
        .map((x) => x.id)
        .sort()
    ).toEqual(["a", "b"]);
  });
});

describe("waitsOn / blockedIds", () => {
  const list = [
    t("a"),
    t("b", { blockedBy: "a" }),
    t("c", { blockedBy: "done-one" }),
    t("done-one", { done: true }),
    t("d", { blockedBy: "a", done: true }),
  ];

  it("a task waits only on a blocker that is still open", () => {
    expect(waitsOn(list[1], list)?.id).toBe("a");
    expect(waitsOn(list[2], list)).toBeNull();
    expect(waitsOn(list[0], list)).toBeNull();
  });

  it("lists the open tasks that wait on an open one", () => {
    expect([...blockedIds(list)]).toEqual(["b"]);
  });
});

describe("projectGroups keeps the flow", () => {
  it("lists a blocker above the task it blocks inside a group", () => {
    const tasks = [t("second", { blockedBy: "first" }), t("first")];
    const { groups } = projectGroups("p", tasks, "2026-10-14");
    expect(groups).toHaveLength(1);
    expect(groups[0].tasks.map((x) => x.id)).toEqual(["first", "second"]);
  });
});
