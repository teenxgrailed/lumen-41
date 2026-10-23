import { collaborationOrigin, contentSecurityPolicy } from "@/lib/security/csp";
import { cspReports } from "@/lib/security/csp-report";

function directives(policy: string) {
  return Object.fromEntries(
    policy.split("; ").map((part) => {
      const [name, ...values] = part.split(" ");
      return [name, values];
    })
  );
}

describe("contentSecurityPolicy", () => {
  it("allows only the origins the browser talks to and reports to the sink", () => {
    const d = directives(
      contentSecurityPolicy({ collaborationUrl: "wss://collab.needt.app/ws" })
    );
    expect(d["default-src"]).toEqual(["'self'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["script-src"]).toContain("https://stats.needt.app");
    expect(d["script-src"]).not.toContain("'unsafe-eval'");
    expect(d["connect-src"]).toEqual([
      "'self'",
      "https://stats.needt.app",
      "https://*.sentry.io",
      "wss://collab.needt.app",
    ]);
    expect(d["form-action"]).toContain("https://accounts.google.com");
    expect(d["report-uri"]).toEqual(["/api/csp-report"]);
  });

  it("adds eval and the hot-reload socket only in development", () => {
    const d = directives(contentSecurityPolicy({ development: true }));
    expect(d["script-src"]).toContain("'unsafe-eval'");
    expect(d["connect-src"]).toContain("ws:");
  });

  it("drops a missing or malformed collaboration URL", () => {
    expect(collaborationOrigin(undefined)).toBeNull();
    expect(collaborationOrigin("not a url")).toBeNull();
    expect(collaborationOrigin("javascript:alert(1)")).toBeNull();
    expect(collaborationOrigin("ws://localhost:1234")).toBe(
      "ws://localhost:1234"
    );
  });
});

describe("cspReports", () => {
  it("reads the legacy report-uri shape and strips queries and tokens", () => {
    const [report] = cspReports({
      "csp-report": {
        "document-uri":
          "https://use.needt.app/p/9f8e7d6c5b4a39281706f5e4d3c2b1a0?secret=1",
        "violated-directive": "script-src-elem",
        "effective-directive": "script-src-elem",
        "blocked-uri": "https://evil.example/x.js?token=abc",
        "source-file": "https://use.needt.app/_next/static/chunks/app.js",
        "line-number": 12,
        "column-number": 4,
        disposition: "report",
      },
    });
    expect(report).toEqual({
      directive: "script-src-elem",
      blocked: "https://evil.example",
      document: "https://use.needt.app/p/:id",
      source: "https://use.needt.app/_next/static/chunks/app.js",
      line: 12,
      column: 4,
      disposition: "report",
    });
  });

  it("reads the Reporting API shape and skips other report types", () => {
    const reports = cspReports([
      { type: "deprecation", body: { message: "x" } },
      {
        type: "csp-violation",
        body: {
          documentURL: "https://use.needt.app/today",
          effectiveDirective: "script-src-elem",
          blockedURL: "inline",
          disposition: "report",
        },
      },
    ]);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      directive: "script-src-elem",
      blocked: "inline",
      document: "https://use.needt.app/today",
    });
  });

  it("returns nothing for anything else", () => {
    expect(cspReports(null)).toEqual([]);
    expect(cspReports({ other: 1 })).toEqual([]);
    expect(cspReports("text")).toEqual([]);
  });

  it("keeps only a scheme for data and blob sources", () => {
    const [report] = cspReports({
      "csp-report": { "blocked-uri": "data:text/html;base64,PHNjcmlwdD4=" },
    });
    expect(report.blocked).toBe("data:");
  });
});
