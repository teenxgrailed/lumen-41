import {
  sanitizeLogEntry,
  sanitizeLogMetadata,
  sanitizeLogText,
} from "@/lib/logger/sanitize";

describe("persisted log sanitization", () => {
  it("removes content-bearing metadata and redacts sensitive strings", () => {
    expect(
      sanitizeLogMetadata({
        email: "person@example.com",
        body: "private mail body",
        pageContent: "private page body",
        token: "secret-token",
        errorType: "ProviderError",
        attempt: 2,
        nested: { recipient: "person@example.com", state: "retry" },
      })
    ).toEqual({ attempt: 2, errorType: "ProviderError" });
  });

  it("redacts dynamic error text before it reaches persisted logs", () => {
    expect(
      sanitizeLogText("Failed for person@example.com token=top-secret")
    ).toBe("Failed for [redacted email] token=[redacted]");
    expect(sanitizeLogText("private\nmail body")).toBe("[redacted text]");
  });

  it("sanitizes every persisted entry boundary", () => {
    expect(
      sanitizeLogEntry({
        level: "error",
        message: "Could not send to person@example.com",
        metadata: { authorization: "Bearer secret" },
        timestamp: new Date("2026-08-23T00:00:00Z"),
      })
    ).toMatchObject({
      message: "Could not send to [redacted email]",
      metadata: {},
    });
  });

  describe("error text", () => {
    it("lets error text reach the log (string and Error object)", () => {
      expect(sanitizeLogMetadata({ error: "ECONNRESET on sync" })).toEqual({
        error: "ECONNRESET on sync",
      });
      expect(
        sanitizeLogMetadata({ error: new TypeError("bad input") })
      ).toEqual({ error: "TypeError: bad input" });
      expect(
        sanitizeLogMetadata({
          errorMessage: "boom",
          errorName: "SyncError",
          reason: "token_expired",
          cause: "socket hang up",
          code: "P2002",
        })
      ).toEqual({
        errorMessage: "boom",
        errorName: "SyncError",
        reason: "token_expired",
        cause: "socket hang up",
        code: "P2002",
      });
    });

    it("truncates multi-line text instead of dropping it", () => {
      const stack = Array.from({ length: 9 }, (_, i) => `at fn${i} (file.ts)`);
      const out = sanitizeLogMetadata({ stack: stack.join("\n") }).stack;
      expect(out).toBe(stack.slice(0, 5).join(" | "));
      const long = sanitizeLogMetadata({ error: "x ".repeat(600) }).error;
      expect(String(long).length).toBeLessThanOrEqual(512);
      expect(sanitizeLogMetadata({ error: "a\nb" }).error).toBe("a | b");
    });

    it("redacts secrets inside error text", () => {
      const out = sanitizeLogMetadata({
        error:
          "fail for person@example.com token=abc Bearer xyz.123 key AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 at https://api.test/v1?code=1&sig=2",
      }).error as string;
      expect(out).not.toMatch(
        /person@example|abc|xyz\.123|AbCdEf|code=1|sig=2/
      );
      expect(out).toContain("[redacted email]");
      expect(out).toContain("token=[redacted]");
      expect(out).toContain("Bearer [redacted]");
      expect(out).toContain("[redacted token]");
      expect(out).toContain("https://api.test/v1?[redacted]");
    });

    it("still drops content-bearing keys", () => {
      expect(
        sanitizeLogMetadata({
          message: "hi",
          body: "x",
          text: "x",
          detail: "x",
          subject: "x",
          url: "https://a.test",
          payload: "x",
          response: "x",
          request: "x",
          html: "x",
          content: "x",
          cookie: "x",
          password: "x",
          secret: "x",
          email: "a@b.co",
        })
      ).toEqual({});
    });
  });
});
