import { readFileSync } from "fs";
import { join } from "path";

// These tests pin the Google OAuth setup instructions (issue #76): the README and
// the in-app System Settings panel must agree, document BOTH required redirect URIs,
// and explain the two common connection failures. They read the source docs/components
// from disk so the assertions track the shipped content.

const repoRoot = join(__dirname, "..", "..");
const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
const settings = readFileSync(
  join(repoRoot, "src", "components", "settings", "SystemSettings.tsx"),
  "utf8"
);
const checklist = readFileSync(
  join(repoRoot, "docs", "self-hosting-setup-checklist.md"),
  "utf8"
);

describe("Google OAuth setup docs (issue #76)", () => {
  describe("README", () => {
    // Limit assertions to the Google Cloud Setup section so unrelated mentions
    // elsewhere in the README cannot mask a missing instruction.
    const googleSection = (() => {
      const idx = readme.indexOf("## Google Cloud Setup");
      if (idx === -1) return readme;
      const next = readme.indexOf("\n## ", idx + 1);
      return next === -1 ? readme.slice(idx) : readme.slice(idx, next);
    })();

    it("documents the calendar-connect redirect URI", () => {
      expect(googleSection).toContain("/api/calendar/google");
    });

    it("documents the Google sign-in callback redirect URI", () => {
      expect(googleSection).toContain("/api/auth/callback/google");
    });

    it("explains NEXTAUTH_URL drives the redirect and must match the public URL", () => {
      expect(googleSection).toContain("NEXTAUTH_URL");
      // It must not tell users that NEXT_PUBLIC_APP_URL is what controls the redirect.
      expect(googleSection).toMatch(
        /NEXTAUTH_URL[^]*public URL|public URL[^]*NEXTAUTH_URL/
      );
    });

    it("warns that private IPs / .local hosts are rejected by Google", () => {
      expect(googleSection.toLowerCase()).toMatch(/private ip|\.local/);
      expect(googleSection).toContain("localhost");
    });

    it("documents the Google Tasks connect redirect URI", () => {
      expect(googleSection).toContain("/api/task-sync/google/callback");
    });

    it("lists the OAuth consent scopes the app actually requests (canonical URLs)", () => {
      // The sensitive scopes: calendar connection and, on its own consent,
      // Google Tasks.
      for (const scope of [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/tasks",
      ]) {
        expect(googleSection).toContain(scope);
      }
      // The malformed shorthand with a leading "./" should no longer be present.
      expect(googleSection).not.toContain("./auth/calendar");
    });
  });

  describe("In-app System Settings", () => {
    const googleBlock = (() => {
      const idx = settings.indexOf("Google Calendar Integration");
      // capture up to the start of the Outlook block
      const outlook = settings.indexOf("Outlook Calendar Integration");
      const end = outlook === -1 ? idx + 4000 : outlook;
      return idx === -1 ? settings : settings.slice(idx, end);
    })();

    it("references the calendar-connect redirect URI path", () => {
      expect(googleBlock).toContain("/api/calendar/google");
    });

    it("references the Google sign-in callback redirect URI path", () => {
      expect(googleBlock).toContain("/api/auth/callback/google");
    });

    it("builds the redirect URIs from the browser origin without a hardcoded host", () => {
      expect(settings).toContain("setOrigin(window.location.origin)");
      expect(googleBlock).toContain("{origin}/api/auth/callback/google");
      expect(googleBlock).not.toContain("http://localhost:3000");
    });

    it("notes the URIs assume NEXTAUTH_URL matches this origin", () => {
      // window.location.origin is what the browser sees; the server derives the
      // real redirect from NEXTAUTH_URL. Behind a proxy/tunnel they can differ,
      // so the panel must tell admins to keep NEXTAUTH_URL aligned with this URL.
      expect(googleBlock).toContain("NEXTAUTH_URL");
    });

    it("warns that private IP / .local origins are rejected by Google", () => {
      // A self-hoster opening Settings at a LAN IP or .local host would otherwise
      // copy invalid redirect URIs; the panel must carry the same caveat as the README.
      expect(googleBlock.toLowerCase()).toMatch(/private ip|\.local/);
    });
  });

  describe("Self-hosting checklist", () => {
    it("lists the Google sign-in callback redirect URI", () => {
      expect(checklist).toContain("/api/auth/callback/google");
    });
  });
});
