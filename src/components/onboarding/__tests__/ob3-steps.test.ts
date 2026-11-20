import {
  ACCOUNT_STEP_INDEX,
  COUNTED3,
  PHASES,
  STEPS3,
  clampStepForSession,
} from "../ob3-steps";

describe("clampStepForSession", () => {
  const at = (s: (typeof STEPS3)[number]) => STEPS3.indexOf(s);

  it("stops a visitor without a session on the account screen", () => {
    expect(ACCOUNT_STEP_INDEX).toBe(at("account"));
    for (const s of [
      "verify",
      "gift",
      "plans",
      "card",
      "bar",
      "opening",
    ] as const) {
      expect(clampStepForSession(at(s), false)).toBe(at("account"));
    }
  });

  it("leaves the screens before the account alone", () => {
    expect(clampStepForSession(at("welcome"), false)).toBe(at("welcome"));
    expect(clampStepForSession(at("notify"), false)).toBe(at("notify"));
    expect(clampStepForSession(at("account"), false)).toBe(at("account"));
  });

  it("lets a signed-in person go anywhere", () => {
    expect(clampStepForSession(at("opening"), true)).toBe(at("opening"));
  });
});

describe("the bottom-bar step", () => {
  const at = (s: (typeof STEPS3)[number]) => STEPS3.indexOf(s);

  it("comes after the account and right before the opening", () => {
    expect(at("bar")).toBeGreaterThan(ACCOUNT_STEP_INDEX);
    expect(at("bar")).toBe(at("opening") - 1);
    expect(STEPS3).toHaveLength(19);
  });

  it("counts towards the progress, which still leaves out card and the ends", () => {
    expect(COUNTED3).toContain("bar");
    expect(COUNTED3).not.toContain("welcome");
    expect(COUNTED3).not.toContain("card");
    expect(COUNTED3).not.toContain("opening");
    expect(COUNTED3).toHaveLength(16);
  });

  it("sits in the last phase", () => {
    expect(PHASES[PHASES.length - 1][1]).toContain("bar");
  });
});
