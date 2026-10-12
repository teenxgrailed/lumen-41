import {
  WAITLIST,
  formReady,
  mailProblem,
  mailProblemText,
  netFailureText,
  oauthButtonLabel,
  passwordShort,
  phoneSubmitLabel,
  refusalText,
  resendClock,
  showWaitlist,
  submitLabel,
  submitStep,
} from "../auth-logic";

describe("email", () => {
  it("says nothing before the first Continue", () => {
    expect(mailProblem({ mail: "", touched: false })).toBeNull();
    expect(mailProblem({ mail: "nope", touched: false })).toBeNull();
  });
  it("asks for an address, then for an @", () => {
    expect(mailProblemText(mailProblem({ mail: "", touched: true }))).toBe(
      "Enter your email."
    );
    expect(mailProblemText(mailProblem({ mail: "ana", touched: true }))).toBe(
      "Include an @ in the address."
    );
    expect(mailProblem({ mail: "@x", touched: true })).toBe("shape");
    expect(mailProblem({ mail: "a@b", touched: true })).toBeNull();
  });
});

describe("password", () => {
  it("is short only once something is typed", () => {
    expect(passwordShort("")).toBe(false);
    expect(passwordShort("1234567")).toBe(true);
    expect(passwordShort("12345678")).toBe(false);
  });
});

describe("what the button does", () => {
  it("walks address, then password, then submits", () => {
    expect(submitStep({ mail: "", pass: "", withPass: false })).toBe(
      "ask-mail"
    );
    expect(submitStep({ mail: "a@b", pass: "", withPass: false })).toBe(
      "ask-password"
    );
    expect(submitStep({ mail: "a@b", pass: "short", withPass: true })).toBe(
      "ask-password"
    );
    expect(
      submitStep({ mail: "a@b", pass: "long enough", withPass: true })
    ).toBe("ready");
  });
  it("labels itself for the mode", () => {
    expect(submitLabel("login", false, false)).toBe("Continue");
    expect(submitLabel("login", true, false)).toBe("Sign in");
    expect(submitLabel("signup", true, false)).toBe("Create account");
    expect(submitLabel("signup", true, true)).toBe("Setting up your day…");
  });
});

describe("refusals", () => {
  it("prefers the server's own words", () => {
    expect(refusalText("wrong", "Too many attempts.")).toBe(
      "Too many attempts."
    );
    expect(refusalText("taken")).toMatch(/already has an account/);
    expect(refusalText("wrong")).toMatch(/do not match/);
    expect(refusalText(null)).toBeNull();
  });
  it("formats the resend countdown", () => {
    expect(resendClock(30)).toBe("0:30");
    expect(resendClock(7)).toBe("0:07");
    expect(resendClock(-1)).toBe("0:00");
  });
});

describe("closed sign-ups", () => {
  it("the waitlist line is the one sentence both screens show", () => {
    expect(WAITLIST.lead + WAITLIST.host).toBe(
      "New here? Join the waitlist at needt.app"
    );
    expect(WAITLIST.href).toBe("https://needt.app");
  });
  it('shows only on sign-in, only once the answer is "closed"', () => {
    expect(showWaitlist({ mode: "login", signupClosed: true })).toBe(true);
    // not answered yet, or open
    expect(showWaitlist({ mode: "login", signupClosed: false })).toBe(false);
    // someone already on the sign-up form keeps it
    expect(showWaitlist({ mode: "signup", signupClosed: true })).toBe(false);
  });
});

describe("the phone form", () => {
  it("sends only when both fields are good", () => {
    expect(formReady({ mail: "ana@x.ch", pass: "12345678" })).toBe(true);
    expect(formReady({ mail: "ana@x.ch", pass: "1234567" })).toBe(false);
    expect(formReady({ mail: "ana", pass: "12345678" })).toBe(false);
    expect(formReady({ mail: "", pass: "" })).toBe(false);
  });
  it("labels its one button", () => {
    expect(phoneSubmitLabel("login", false)).toBe("Sign in");
    expect(phoneSubmitLabel("signup", false)).toBe("Create the account");
    expect(phoneSubmitLabel("login", true)).toBe("Signing in…");
    expect(phoneSubmitLabel("signup", true)).toBe("Creating…");
  });
  it("names the failure by what was being done", () => {
    expect(netFailureText({ recover: true, signup: false })).toMatch(/link/);
    expect(netFailureText({ recover: false, signup: true })).toMatch(/account/);
    expect(netFailureText({ recover: false, signup: false })).toMatch(
      /sign in/
    );
  });
});

describe("sign-in provider buttons", () => {
  it("word each button the way its provider's guidelines do", () => {
    expect(oauthButtonLabel({ id: "google", label: "Google" })).toBe(
      "Continue with Google"
    );
    expect(oauthButtonLabel({ id: "azure-ad", label: "Microsoft" })).toBe(
      "Sign in with Microsoft"
    );
  });
});
