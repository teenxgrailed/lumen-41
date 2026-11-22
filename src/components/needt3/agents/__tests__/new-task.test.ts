import {
  APPROVE_MAX,
  CONTEXT_MIN,
  EMPTY_NEW_TASK,
  type NewTaskForm,
  approveLabel,
  contextOf,
  newTaskPayload,
  newTaskProblem,
  parseSkills,
} from "../new-task";

const form = (patch: Partial<NewTaskForm> = {}): NewTaskForm => ({
  ...EMPTY_NEW_TASK,
  title: "Post the launch thread",
  goal: "Write and publish the launch thread on the brand account.",
  done: "The thread is live",
  agent: "a1",
  ...patch,
});

describe("parseSkills", () => {
  it("lowercases, trims, drops empties and repeats", () => {
    expect(parseSkills(" Browser, writing ,,BROWSER\nyoutube ")).toEqual([
      "browser",
      "writing",
      "youtube",
    ]);
  });

  it("keeps at most ten tags", () => {
    const many = Array.from({ length: 14 }, (_, i) => `s${i}`).join(",");
    expect(parseSkills(many)).toHaveLength(10);
  });
});

describe("newTaskProblem", () => {
  it("accepts a full brief", () => {
    expect(newTaskProblem(form())).toBeNull();
  });

  it("names the first thing missing, in the hub's order", () => {
    expect(newTaskProblem(form({ title: "  " }))).toMatch(/title/i);
    expect(newTaskProblem(form({ goal: "too short" }))).toMatch(
      /20 characters/
    );
    expect(newTaskProblem(form({ done: "" }))).toMatch(/done/i);
  });

  it("needs a skill when the task is for any agent", () => {
    expect(newTaskProblem(form({ agent: "any" }))).toMatch(/skill/i);
    expect(
      newTaskProblem(form({ agent: "any", skills: "browser" }))
    ).toBeNull();
  });
});

describe("contextOf", () => {
  it("keeps the owner's own context when it is long enough", () => {
    const own = "x".repeat(CONTEXT_MIN);
    expect(contextOf(form({ context: own }))).toBe(own);
  });

  it("always reaches the hub's minimum, falling back on the goal", () => {
    const text = contextOf(form({ goal: "x".repeat(20), context: "" }));
    expect(text.length).toBeGreaterThanOrEqual(CONTEXT_MIN);
    expect(text).toContain("x".repeat(20));
    expect(text).toMatch(/Created by the owner/);
  });
});

describe("newTaskPayload", () => {
  it("builds the body of POST /api/agent-hub/items for one agent", () => {
    const body = newTaskPayload(
      form({ risks: ["publish", "publish", "money"] })
    );
    expect(body).toMatchObject({
      title: "Post the launch thread",
      doneCriteria: "The thread is live",
      assignee: "a1",
      risks: ["publish", "money"],
    });
    expect(body).not.toHaveProperty("requiredSkills");
    expect(body.context.length).toBeGreaterThanOrEqual(CONTEXT_MIN);
  });

  it("sends the skills only for 'any'", () => {
    const body = newTaskPayload(
      form({ agent: "any", skills: "Browser, youtube" })
    );
    expect(body.assignee).toBe("any");
    expect(body).toHaveProperty("requiredSkills", ["browser", "youtube"]);
  });
});

describe("approveLabel", () => {
  it("says what is let through, not the enum", () => {
    expect(approveLabel("publish")).toBe("Approve post");
    expect(approveLabel("send_message")).toBe("Approve message");
    expect(approveLabel("money")).toBe("Approve payment");
    expect(approveLabel("delete")).toBe("Approve delete");
  });

  it("cuts an unknown, long risk at a word and never outgrows the limit", () => {
    const label = approveLabel("Sends a public post to the brand account");
    expect(label).toBe("Approve Sends a…");
    expect(label.replace("Approve ", "").length).toBeLessThanOrEqual(
      APPROVE_MAX + 1
    );
    expect(approveLabel("one_word_without_any_spaces_at_all")).toBe(
      "Approve one word…"
    );
  });

  it("leaves a short unknown risk whole", () => {
    expect(approveLabel("spend")).toBe("Approve spend");
  });
});
