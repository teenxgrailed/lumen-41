import {
  INTERNAL_EMAIL_RULES,
  internalReason,
  isInternalAccount,
  parseInternalEmails,
} from "../internal-accounts";

const person = (
  over: Partial<Parameters<typeof isInternalAccount>[0]> = {}
) => ({
  email: "anna@gmail.com",
  role: "user",
  sandboxKind: null,
  internal: false,
  ...over,
});

describe("isInternalAccount", () => {
  it("keeps an ordinary person external", () => {
    expect(isInternalAccount(person())).toBe(false);
    expect(internalReason(person())).toBeNull();
  });

  it("treats the flag, an admin and a sandbox account as internal", () => {
    expect(internalReason(person({ internal: true }))).toBe("flag");
    expect(internalReason(person({ role: "admin" }))).toBe("admin");
    expect(internalReason(person({ sandboxKind: "reviewer" }))).toBe("sandbox");
    expect(internalReason(person({ sandboxKind: "publicDemo" }))).toBe(
      "sandbox"
    );
  });

  it("matches the address patterns, case-insensitively", () => {
    for (const email of [
      "hello@needt.app",
      "Someone@NEEDT.APP",
      "x@example.com",
      "x@y.test",
      "me+test@gmail.com",
      "me+needt@gmail.com",
      "reviewer@anything.org",
      "test@gmail.com",
      "bot@foo.io",
    ]) {
      expect(isInternalAccount(person({ email }))).toBe(true);
    }
  });

  it("does not catch look-alikes", () => {
    for (const email of [
      "testa@gmail.com",
      "latest@gmail.com",
      "botond@gmail.com",
      "demo.person@gmail.com",
      "anna@needt.app.example.ch",
      "anna@mynneedt.app",
    ]) {
      expect(isInternalAccount(person({ email }))).toBe(false);
    }
  });

  it("matches the owner's exact addresses from the environment list", () => {
    const owner = parseInternalEmails(" Owner@Gmail.com, ,second@x.ch ");
    expect(owner).toEqual(["owner@gmail.com", "second@x.ch"]);
    expect(internalReason(person({ email: "OWNER@gmail.com" }), owner)).toBe(
      "owner-email"
    );
    expect(
      isInternalAccount(person({ email: "owner2@gmail.com" }), owner)
    ).toBe(false);
  });

  it("keeps an account with no address external", () => {
    expect(isInternalAccount(person({ email: null }))).toBe(false);
  });

  it("documents every rule", () => {
    for (const rule of INTERNAL_EMAIL_RULES) expect(rule.why).not.toBe("");
  });
});
