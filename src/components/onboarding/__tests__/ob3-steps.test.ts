import { ACCOUNT_STEP_INDEX, STEPS3, clampStepForSession } from "../ob3-steps";

describe("clampStepForSession", () => {
  const at = (s: (typeof STEPS3)[number]) => STEPS3.indexOf(s);

  it("stops a visitor without a session on the account screen", () => {
    expect(ACCOUNT_STEP_INDEX).toBe(at("account"));
    for (const s of ["verify", "gift", "plans", "card", "opening"] as const) {
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
