import { readFileSync } from "node:fs";
import { join } from "node:path";

import { GMAIL_OAUTH_SCOPES, OUTLOOK_MAIL_OAUTH_SCOPES } from "../scopes";

const WRITE_SCOPE =
  /modify|send|compose|insert|labels|ReadWrite|mail\.google\.com|Write/i;

describe("mail OAuth scopes are read-only", () => {
  it("lists no write scope", () => {
    for (const scope of [...GMAIL_OAUTH_SCOPES, ...OUTLOOK_MAIL_OAUTH_SCOPES]) {
      expect(scope).not.toMatch(WRITE_SCOPE);
    }
    expect(GMAIL_OAUTH_SCOPES).toContain(
      "https://www.googleapis.com/auth/gmail.readonly"
    );
    expect(OUTLOOK_MAIL_OAUTH_SCOPES).toContain("Mail.Read");
  });

  it("auth routes use the shared lists and no inline write scope", () => {
    const routes: Array<[string, string]> = [
      ["src/app/api/mail/oauth/google/auth/route.ts", "GMAIL_OAUTH_SCOPES"],
      [
        "src/app/api/mail/oauth/outlook/auth/route.ts",
        "OUTLOOK_MAIL_OAUTH_SCOPES",
      ],
    ];
    for (const [file, name] of routes) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).toContain(name);
      expect(source).not.toMatch(
        /gmail\.(modify|send|compose)|Mail\.(ReadWrite|Send)/
      );
    }
  });
});
