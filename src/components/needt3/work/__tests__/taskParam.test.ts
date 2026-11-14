/** @jest-environment jsdom */
import { setOpenTask, withParam } from "../taskParam";

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe("setOpenTask", () => {
  it("writes ?task= with replaceState, never a router navigation", () => {
    window.history.replaceState(null, "", "/tasks?tab=today");
    const spy = jest.spyOn(window.history, "replaceState");
    setOpenTask("t1");
    expect(window.location.search).toBe("?tab=today&task=t1");
    setOpenTask(null);
    expect(window.location.search).toBe("?tab=today");
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

describe("withParam", () => {
  it("adds the param and keeps the others", () => {
    expect(withParam("/tasks?tab=today", "task", "t1")).toBe(
      "/tasks?tab=today&task=t1"
    );
  });
  it("replaces an existing value", () => {
    expect(withParam("/tasks?task=a", "task", "b")).toBe("/tasks?task=b");
  });
  it("drops the param and the bare ? with it", () => {
    expect(withParam("/tasks?task=a", "task", null)).toBe("/tasks");
  });
  it("keeps the hash and encodes ids", () => {
    expect(withParam("/tasks#x", "task", "a b")).toBe("/tasks?task=a+b#x");
  });
});
