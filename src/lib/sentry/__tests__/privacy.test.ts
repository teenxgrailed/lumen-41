import {
  dropSentryBreadcrumb,
  safeErrorCode,
  scrubSentryEvent,
  scrubSentrySpan,
} from "@/lib/sentry/privacy";

describe("Sentry privacy filtering", () => {
  it("keeps only release triage metadata from an error event", () => {
    const event = scrubSentryEvent({
      event_id: "event-1",
      level: "error",
      release: "abc123",
      environment: "production",
      tags: { service: "worker", email: "person@example.com" },
      request: { url: "https://use.needt.app/mail?token=secret" },
      user: { email: "person@example.com" },
      extra: { body: "private mail body", token: "secret" },
      breadcrumbs: [{ message: "private page content" }],
      message: "person@example.com reset token secret",
      transaction: "/mail/private-thread",
      exception: {
        values: [
          {
            type: "Error",
            value: "secret",
            module: "app",
            stacktrace: {
              frames: [
                {
                  filename: "src/lib/mail/send.ts",
                  function: "sendThread",
                  lineno: 42,
                  colno: 7,
                  in_app: true,
                  vars: { recipient: "person@example.com", token: "secret" },
                  pre_context: ["const body = privateMailBody;"],
                },
              ],
            },
          },
        ],
      },
    });

    expect(event).toEqual({
      event_id: "event-1",
      level: "error",
      release: "abc123",
      environment: "production",
      tags: { service: "worker" },
      exception: {
        values: [
          {
            type: "Error",
            module: "app",
            stacktrace: {
              frames: [
                {
                  filename: "src/lib/mail/send.ts",
                  function: "sendThread",
                  lineno: 42,
                  colno: 7,
                  in_app: true,
                },
              ],
            },
          },
        ],
      },
    });
  });

  it("carries a frame's location but never its locals or source context", () => {
    const event = scrubSentryEvent({
      exception: {
        values: [
          {
            type: "TypeError",
            value: "Cannot read properties of undefined (reading 'filter')",
            stacktrace: {
              frames: [
                {
                  filename: "src/components/settings/AccountSettings.tsx",
                  function: "loadProviders",
                  lineno: 62,
                  in_app: true,
                  vars: { data: { providers: undefined } },
                },
              ],
            },
          },
        ],
      },
    });

    const [value] = event.exception?.values ?? [];
    expect(value).not.toHaveProperty("value");
    const [frame] = value?.stacktrace?.frames ?? [];
    expect(frame).toEqual({
      filename: "src/components/settings/AccountSettings.tsx",
      function: "loadProviders",
      lineno: 62,
      in_app: true,
    });
  });

  it("drops every breadcrumb and trace attribute", () => {
    expect(dropSentryBreadcrumb()).toBeNull();
    expect(
      scrubSentrySpan({
        data: { "http.url": "https://use.needt.app/mail?token=secret" },
        description: "/mail/private-thread",
        span_id: "span-1",
        start_timestamp: 1,
        trace_id: "trace-1",
        links: [{ attributes: { email: "person@example.com" } }],
      })
    ).toEqual({
      data: {},
      span_id: "span-1",
      start_timestamp: 1,
      trace_id: "trace-1",
    });
  });

  it("keeps debug_meta images so source maps resolve, and only their ids and paths", () => {
    const event = scrubSentryEvent({
      debug_meta: {
        images: [
          {
            type: "sourcemap",
            debug_id: "0a1b2c3d-0000-4000-8000-000000000000",
            code_file: "app:///_next/static/chunks/app/page.js",
            extra: "person@example.com",
          } as never,
        ],
      },
    });

    expect(event.debug_meta).toEqual({
      images: [
        {
          type: "sourcemap",
          debug_id: "0a1b2c3d-0000-4000-8000-000000000000",
          code_file: "app:///_next/static/chunks/app/page.js",
        },
      ],
    });
  });

  it("keeps abs_path and a reduced mechanism, and still drops value, message and vars", () => {
    const event = scrubSentryEvent({
      message: "person@example.com",
      exception: {
        values: [
          {
            type: "HubError",
            value: "task Secret plan not found",
            mechanism: {
              type: "onerror",
              handled: false,
              data: { url: "https://use.needt.app/?token=secret" },
            } as never,
            stacktrace: {
              frames: [
                {
                  abs_path: "app:///_next/server/app/api/x/route.js",
                  function: "z",
                  vars: { token: "secret" },
                } as never,
              ],
            },
          },
        ],
      },
    });

    expect(event).not.toHaveProperty("message");
    const [value] = event.exception?.values ?? [];
    expect(value).not.toHaveProperty("value");
    expect(value?.mechanism).toEqual({ type: "onerror", handled: false });
    expect(value?.stacktrace?.frames?.[0]).toEqual({
      abs_path: "app:///_next/server/app/api/x/route.js",
      function: "z",
    });
  });

  describe("error_code tag", () => {
    const tagFor = (originalException: unknown) =>
      scrubSentryEvent({ tags: { service: "web" } }, { originalException })
        .tags;

    it("takes a string code that looks like a code", () => {
      const error = Object.assign(new Error("secret@example.com"), {
        code: "TOKEN_IN_USE",
      });
      expect(tagFor(error)).toEqual({
        service: "web",
        error_code: "TOKEN_IN_USE",
      });
    });

    it("takes a class name other than Error", () => {
      class HubError extends Error {
        constructor() {
          super("x");
          this.name = "HubError";
        }
      }
      expect(tagFor(new HubError())).toEqual({
        service: "web",
        error_code: "HubError",
      });
    });

    it("rejects anything that is not a bare identifier", () => {
      expect(safeErrorCode(new Error("boom"))).toBeUndefined();
      expect(safeErrorCode({ code: "person@example.com" })).toBeUndefined();
      expect(safeErrorCode({ code: "lower_case" })).toBeUndefined();
      expect(safeErrorCode({ code: "HAS SPACE" })).toBeUndefined();
      expect(safeErrorCode({ code: "A" })).toBeUndefined();
      expect(safeErrorCode({ code: 404 })).toBeUndefined();
      expect(safeErrorCode({ code: "A".repeat(65) })).toBeUndefined();
      expect(safeErrorCode({ name: "Error" })).toBeUndefined();
      expect(safeErrorCode({ name: "Not safe: a@b.c" })).toBeUndefined();
      expect(safeErrorCode({ name: "ab" })).toBeUndefined();
      expect(safeErrorCode("TOKEN_IN_USE")).toBeUndefined();
      expect(safeErrorCode(null)).toBeUndefined();
    });

    it("prefers the code over the name and adds no tag without either", () => {
      const error = Object.assign(new TypeError("x"), { code: "E_BAD" });
      expect(safeErrorCode(error)).toBe("E_BAD");
      const event = scrubSentryEvent({}, { originalException: new Error("x") });
      expect(event).not.toHaveProperty("tags");
    });
  });
});
