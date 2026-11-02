import { readFileSync } from "fs";
import { join } from "path";

import {
  buildCalendarOAuthRedirectUrl,
  buildGoogleTasksRedirectUrl,
} from "@/lib/oauth-redirects";

const deployGuide = readFileSync(
  join(__dirname, "..", "..", "docs", "deploy.md"),
  "utf8"
);

describe("production OAuth redirect documentation", () => {
  it.each(["google", "outlook"] as const)(
    "documents the exact %s calendar callback built by the runtime",
    (provider) => {
      expect(deployGuide).toContain(
        buildCalendarOAuthRedirectUrl(provider, "https://use.needt.app")
      );
    }
  );

  it("documents the exact Google Tasks callback built by the runtime", () => {
    expect(deployGuide).toContain(
      buildGoogleTasksRedirectUrl("https://use.needt.app")
    );
  });

  it("does not document auth-start routes as provider callbacks", () => {
    expect(deployGuide).not.toContain(
      "https://use.needt.app/api/calendar/google/auth"
    );
    expect(deployGuide).not.toContain(
      "https://use.needt.app/api/calendar/outlook/auth"
    );
  });
});
