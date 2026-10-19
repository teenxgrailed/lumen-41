import {
  FOCUS_DONE_PARAM,
  canFocusMore,
  focusDoneUrl,
  readFocusDoneParam,
  shouldAskDone,
  withoutFocusDoneParam,
} from "../focus-done";

describe("shouldAskDone", () => {
  const open = { done: false, trashedAt: null };

  it("asks for a session on an open task", () => {
    expect(shouldAskDone({ taskId: "t1", task: open, isBreak: false })).toBe(
      true
    );
  });

  it("does not ask without a task, for a break, or when the task is gone", () => {
    expect(
      shouldAskDone({ taskId: null, task: undefined, isBreak: false })
    ).toBe(false);
    expect(shouldAskDone({ taskId: "t1", task: open, isBreak: true })).toBe(
      false
    );
    expect(
      shouldAskDone({ taskId: "t1", task: undefined, isBreak: false })
    ).toBe(false);
    expect(
      shouldAskDone({
        taskId: "t1",
        task: { done: false, trashedAt: "2026-10-19T09:00:00Z" },
        isBreak: false,
      })
    ).toBe(false);
  });

  it("skips a task that is already completed", () => {
    expect(
      shouldAskDone({
        taskId: "t1",
        task: { done: true, trashedAt: null },
        isBreak: false,
      })
    ).toBe(false);
  });
});

describe("canFocusMore", () => {
  it("is offered when the clock ran out, not after an early stop", () => {
    expect(canFocusMore("complete")).toBe(true);
    expect(canFocusMore("stopped")).toBe(false);
  });
});

describe("the deep link", () => {
  it("round-trips the task id", () => {
    const url = focusDoneUrl("task 1/x");
    expect(url).toBe(`/today?${FOCUS_DONE_PARAM}=task%201%2Fx`);
    expect(readFocusDoneParam(url.slice(url.indexOf("?")))).toBe("task 1/x");
  });

  it("reads nothing from an empty or missing parameter", () => {
    expect(readFocusDoneParam("")).toBeNull();
    expect(readFocusDoneParam("?focusDone=")).toBeNull();
    expect(readFocusDoneParam("?other=1")).toBeNull();
  });

  it("takes only its own parameter off the address", () => {
    expect(withoutFocusDoneParam("?focusDone=t1")).toBe("");
    expect(withoutFocusDoneParam("?a=1&focusDone=t1&b=2")).toBe("?a=1&b=2");
  });
});
