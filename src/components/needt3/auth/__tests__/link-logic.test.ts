import {
  confirmOutcome,
  newPasswordProblem,
  newPasswordText,
  resendOutcome,
  resetOutcome,
} from "../link-logic";

describe("a new password, judged as the server judges it", () => {
  it.each([
    ["", "short"],
    ["Ab1", "short"],
    ["abcdefgh", "mix"],
    ["ABCDEFG1", "mix"],
    ["Abcdefgh", "mix"],
    ["Abcdefg1", null],
  ] as const)("%j → %s", (pass, problem) => {
    expect(newPasswordProblem(pass)).toBe(problem);
  });

  it("says what to fix, or the rule when nothing is wrong", () => {
    expect(newPasswordText("short")).toBe("Use at least 8 characters.");
    expect(newPasswordText("mix")).toMatch(/uppercase.*lowercase.*number/);
    expect(newPasswordText(null)).toMatch(/^At least 8 characters/);
  });
});

describe("what the server answered", () => {
  it("reset: 2xx saved, 400 a dead link, 429 limited, the rest an error", () => {
    expect(resetOutcome(200)).toBe("saved");
    expect(resetOutcome(400)).toBe("invalid");
    expect(resetOutcome(429)).toBe("limited");
    expect(resetOutcome(500)).toBe("error");
  });

  it("confirm: only an ok 'verified' confirms", () => {
    expect(confirmOutcome(true, "verified")).toBe("confirmed");
    expect(confirmOutcome(false, "verified")).toBe("invalid");
    expect(confirmOutcome(true, "expired")).toBe("expired");
    expect(confirmOutcome(false, "error")).toBe("error");
    expect(confirmOutcome(true, "invalid")).toBe("invalid");
    expect(confirmOutcome(true, undefined)).toBe("invalid");
  });

  it("resend: 2xx sent, 429 limited, the rest an error", () => {
    expect(resendOutcome(200)).toBe("sent");
    expect(resendOutcome(429)).toBe("limited");
    expect(resendOutcome(503)).toBe("error");
  });
});
