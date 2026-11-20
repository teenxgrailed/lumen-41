import { taskIconKey } from "../task-icon";

describe("taskIconKey", () => {
  it.each([
    ["Reply to Anna's email", "mail"],
    ["Call the bank", "call"],
    ["Team standup", "meeting"],
    ["Pay the invoice", "money"],
    ["Buy groceries", "shop"],
    ["Gym", "workout"],
    ["Fix the login bug", "code"],
    ["Draft the newsletter", "write"],
    ["Edit the photo set", "camera"],
    ["Learn German", "study"],
    ["Read chapter 4", "read"],
    ["Cook dinner", "cook"],
    ["Flight to Kyiv", "travel"],
    ["Weekly review", "plan"],
    ["Позвонить врачу", "health"],
  ])("%s -> %s", (title, key) => {
    // "Fix the login bug": code; "Call the bank": call comes before money
    expect(taskIconKey(title)).toBe(key);
  });

  it("falls back to generic", () => {
    expect(taskIconKey("Thing")).toBe("generic");
    expect(taskIconKey("")).toBe("generic");
  });

  it("matches word starts, not the middle of a word", () => {
    expect(taskIconKey("Airmail stamps")).toBe("generic");
    expect(taskIconKey("Prune the roses")).toBe("generic");
    expect(taskIconKey("Running")).toBe("workout");
  });

  it("is not case sensitive", () => {
    expect(taskIconKey("EMAIL ANNA")).toBe("mail");
  });
});
