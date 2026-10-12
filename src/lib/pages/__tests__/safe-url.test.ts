import { APP_PATHS, isSafeUrl, safeUrl } from "../safe-url";

describe("safeUrl", () => {
  it.each([
    "https://example.com/a?b=1#c",
    "http://example.com",
    "mailto:someone@example.com",
    "mailto:someone@example.com?subject=Hi",
    "/pages/abc123",
    "/pages/abc123?x=1#y",
    "/api/pages/p1/assets/a1",
    "https://prod-files-secure.s3.us-west-2.amazonaws.com/a%20b.png?X-Amz-Signature=1",
  ])("keeps %s", (value) => {
    expect(safeUrl(value)).toBe(value);
    expect(isSafeUrl(value)).toBe(true);
  });

  it("trims the value it keeps", () => {
    expect(safeUrl("  https://example.com/x \n")).toBe("https://example.com/x");
  });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["javascript: in capitals", "JavaScript:alert(1)"],
    ["javascript: after a space", " javascript:alert(1)"],
    ["a tab inside the scheme", "java\tscript:alert(1)"],
    ["a newline inside the scheme", "java\nscript:alert(1)"],
    ["a control character first", "\u0001javascript:alert(1)"],
    ["a zero-width character", "java​script:alert(1)"],
    ["a non-breaking space", "javascript: alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["data: image", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="],
    ["vbscript:", "vbscript:msgbox(1)"],
    ["file:", "file:///etc/passwd"],
    ["ftp:", "ftp://example.com/a"],
    ["a protocol-relative address", "//evil.example/pages/x"],
    ["a backslash host", "/\\evil.example/pages/x"],
    ["a double backslash", "\\\\evil.example"],
    ["a backslash after https", "https:\\\\evil.example"],
    ["a dot-dot escape from /pages", "/pages/../admin"],
    ["an encoded dot-dot escape", "/pages/%2e%2e/admin"],
    ["an app path outside the list", "/settings"],
    ["a path that only starts like one", "/pagesevil/x"],
    ["credentials in the address", "https://user:secret@example.com/"],
    ["no host", "https://"],
    ["a quote", 'https://example.com/"onmouseover="x'],
    ["an angle bracket", "https://example.com/<script>"],
    ["an empty mailto", "mailto:"],
    ["a bare word", "example.com/path"],
    ["an empty string", ""],
    ["only spaces", "   "],
  ])("refuses %s", (_label, value) => {
    expect(safeUrl(value)).toBeNull();
    expect(isSafeUrl(value)).toBe(false);
  });

  it.each([null, undefined, 42, {}, ["https://example.com"]])(
    "refuses a non-string (%p)",
    (value) => {
      expect(safeUrl(value)).toBeNull();
    }
  );

  it("refuses an address that is absurdly long", () => {
    expect(safeUrl(`https://example.com/${"a".repeat(9000)}`)).toBeNull();
  });

  it("can turn mailto off, and widen the app paths", () => {
    expect(safeUrl("mailto:a@b.co", { allowMailto: false })).toBeNull();
    expect(safeUrl("/tasks?taskId=1")).toBeNull();
    expect(
      safeUrl("/tasks?taskId=1", { paths: [...APP_PATHS, "/tasks"] })
    ).toBe("/tasks?taskId=1");
  });
});
