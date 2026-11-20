import { TASK_ICON_KEYS, isTaskIconKey, taskIconKey } from "../task-icon";

describe("TASK_ICON_KEYS", () => {
  it("offers every key the keyword map can return, except generic", () => {
    const fromMap = new Set(
      [
        "meeting",
        "call",
        "email",
        "pay",
        "buy",
        "gym",
        "doctor",
        "code",
        "design",
        "photo",
        "music",
        "write",
        "study",
        "read",
        "cook",
        "clean",
        "flight",
        "plan",
      ].map(taskIconKey)
    );
    expect(fromMap.has("generic")).toBe(false);
    for (const k of fromMap) expect(TASK_ICON_KEYS).toContain(k);
    expect(TASK_ICON_KEYS).not.toContain("generic");
  });
});

describe("isTaskIconKey", () => {
  it("accepts known keys only", () => {
    expect(isTaskIconKey("call")).toBe(true);
    expect(isTaskIconKey("generic")).toBe(true);
    expect(isTaskIconKey("📞")).toBe(false);
    expect(isTaskIconKey(null)).toBe(false);
    expect(isTaskIconKey(undefined)).toBe(false);
  });
});
