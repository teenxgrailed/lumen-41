import { HubError } from "../errors";
import { assertNoSecrets, secretKind } from "../secret-scan";

// Fixtures are assembled at run time so secret scanners do not flag them.
const j = (...parts: string[]) => parts.join("");

describe("secret scanner", () => {
  const caught: [string, string][] = [
    ["private key", j("-----BEGIN RSA ", "PRIVATE KEY-----\nabc")],
    ["Needt token", `use ${j("needt_", "agent_")}${"a".repeat(43)} now`],
    ["AWS access key id", `key ${j("AK", "IA", "ABCDEFGHIJKLMNOP")}`],
    ["access token", `${j("gh", "p_")}${"a1B2".repeat(9)}`],
    ["Stripe key", `${j("sk_", "live_")}${"a".repeat(24)}`],
    ["Slack token", j("xo", "xb-1234567890-abcdefghij")],
    ["API key", `${j("sk-", "ant-")}${"a".repeat(30)}`],
    ["JSON web token", j("ey", "JhbGciOiJI.", "ey", "JzdWIiOiIx.abcdefghijkl")],
    ["authorization header", `${j("Author", "ization")}: Bearer ${"a".repeat(30)}`],
    ["password in a URL", j("https://user:", "hunter2@example.com/x")],
    ["password or key assignment", "password = correcthorsebattery"],
  ];

  it.each(caught)("catches %s", (kind, text) => {
    expect(secretKind(text)).toBe(kind);
  });

  it.each([
    "Open https://example.com/docs/page?id=42 and read it.",
    "Commit 3f786850e387550fdab836ed7e6dc881de23001b fixed it.",
    "Task 7c342bb8-a864-435a-8f58-ec3b7d76eee8 is the one.",
    "The password field on the sign-in page is too small.",
    "needt_agent_task_claim is the tool name",
  ])("lets %s through", (text) => {
    expect(secretKind(text)).toBeNull();
  });

  it("names the field and the kind and never echoes the value", () => {
    const token = j("gh", "p_") + "a1B2".repeat(9);
    let error: unknown;
    try {
      assertNoSecrets({ title: "ok", context: { nested: [`x ${token}`] } });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(HubError);
    const message = (error as HubError).message;
    expect(message).toContain('"context"');
    expect(message).toContain("access token");
    expect(message).not.toContain(token);
  });
});
