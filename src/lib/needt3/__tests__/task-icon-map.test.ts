import { iconPatch } from "@/components/needt3/phone/overlays/taskModel";

import { TASK_ICON_KEYS, isTaskIconKey, taskIconKey } from "../task-icon";

describe("keyword map, precedence and reach", () => {
  it("the first rule wins when a title has two keywords", () => {
    expect(taskIconKey("Call about the invoice")).toBe("call");
    expect(taskIconKey("Meeting to review the plan")).toBe("meeting");
    expect(taskIconKey("Pay rent")).toBe("money");
  });
  it("reads Russian keywords", () => {
    expect(taskIconKey("Купить молоко")).toBe("shop");
    expect(taskIconKey("Написать текст")).toBe("write");
  });
  it("ignores surrounding space", () => {
    expect(taskIconKey("   gym   ")).toBe("workout");
  });
  it("every pickable key is reachable from some title and is a valid stored value", () => {
    const sample = [
      "call",
      "email",
      "meeting",
      "buy",
      "pay",
      "gym",
      "doctor",
      "cook",
      "clean",
      "flight",
      "read",
      "write",
      "design",
      "photo",
      "code",
      "study",
      "plan",
      "music",
    ];
    const reached = new Set(sample.map(taskIconKey));
    for (const k of TASK_ICON_KEYS) {
      expect(reached.has(k)).toBe(true);
      expect(isTaskIconKey(k)).toBe(true);
    }
  });
  it("a pick writes the key, Automatic writes null", () => {
    expect(iconPatch("cook")).toEqual({ icon: "cook" });
    expect(iconPatch(null)).toEqual({ icon: null });
  });
});
