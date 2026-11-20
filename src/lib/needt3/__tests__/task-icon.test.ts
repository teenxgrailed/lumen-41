import { TASK_ICON_CHOICES, taskIconFor } from "../task-icon";

describe("taskIconFor", () => {
  it("picks an icon from a keyword in the title", () => {
    expect(taskIconFor("Call mum")).toBe("📞");
    expect(taskIconFor("buy oat milk")).toBe("🛒");
    expect(taskIconFor("Pay the rent")).toBe("💳");
    expect(taskIconFor("Fix login bug")).toBe("💻");
  });
  it("matches whole words only", () => {
    expect(taskIconFor("Recall the brief")).not.toBe("📞");
    expect(taskIconFor("Prune the hedge")).toBeNull();
  });
  it("gives nothing for an empty or unknown title", () => {
    expect(taskIconFor("")).toBeNull();
    expect(taskIconFor("   ")).toBeNull();
    expect(taskIconFor("Zzz qqq")).toBeNull();
  });
  it("only suggests icons the picker also offers", () => {
    for (const t of ["call", "email", "meeting", "gym", "doctor", "design"]) {
      const icon = taskIconFor(t);
      expect(icon).not.toBeNull();
      expect(TASK_ICON_CHOICES).toContain(icon);
    }
  });
});
