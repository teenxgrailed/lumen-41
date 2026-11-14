import { withParam } from "../taskParam";

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
