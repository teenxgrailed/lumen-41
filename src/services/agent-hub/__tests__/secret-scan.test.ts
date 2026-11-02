import { HubError } from "../errors";
import { assertNoSecrets, secretKind } from "../secret-scan";

describe("secret scanner", () => {
  const caught: [string, string][] = [
    ["private key", "-----BEGIN RSA PRIVATE KEY-----\nabc"],
    ["Needt token", `use needt_agent_${"a".repeat(43)} now`],
    ["AWS access key id", "key AKIAABCDEFGHIJKLMNOP"],
    ["access token", `ghp_${"a1B2".repeat(9)}`],
    ["Stripe key", `sk_live_${"a".repeat(24)}`],
    ["Slack token", "xoxb-1234567890-abcdefghij"],
    ["API key", `sk-ant-${"a".repeat(30)}`],
    ["JSON web token", "eyJhbGciOiJI.eyJzdWIiOiIx.abcdefghijkl"],
    ["authorization header", `Authorization: Bearer ${"a".repeat(30)}`],
    ["password in a URL", "https://user:hunter2@example.com/x"],
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
    const token = `ghp_${"a1B2".repeat(9)}`;
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
