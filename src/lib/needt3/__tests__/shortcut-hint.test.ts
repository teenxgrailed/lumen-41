import { hintFor, isApplePlatform } from "../shortcut-hint";

describe("shortcut hints per platform", () => {
  it("keeps the Mac glyphs on a Mac, an iPhone and an iPad", () => {
    expect(
      isApplePlatform({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        platform: "MacIntel",
      })
    ).toBe(true);
    expect(
      isApplePlatform({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        platform: "iPhone",
      })
    ).toBe(true);
    expect(hintFor("⌘⇧F", true)).toBe("⌘⇧F");
  });

  it("is not Apple on Linux or Windows", () => {
    expect(
      isApplePlatform({
        userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/120",
        platform: "Linux x86_64",
      })
    ).toBe(false);
    expect(
      isApplePlatform({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
        platform: "Win32",
      })
    ).toBe(false);
  });

  it("writes Ctrl, Shift and Alt elsewhere", () => {
    expect(hintFor("⌘K", false)).toBe("Ctrl+K");
    expect(hintFor("⌘⇧F", false)).toBe("Ctrl+Shift+F");
    expect(hintFor("⌘⌥\\", false)).toBe("Ctrl+Alt+\\");
    expect(hintFor("⌘,", false)).toBe("Ctrl+,");
    expect(hintFor("⌘↵", false)).toBe("Ctrl+↵");
    expect(hintFor("⌘↵ to add", false)).toBe("Ctrl+↵ to add");
    expect(hintFor("Last 5 copies · ⌘⇧V", false)).toBe(
      "Last 5 copies · Ctrl+Shift+V"
    );
  });

  it("turns one key cap into its word, and leaves plain keys alone", () => {
    expect(hintFor("⌘", false)).toBe("Ctrl");
    expect(hintFor("⇧", false)).toBe("Shift");
    expect(hintFor("⌥", false)).toBe("Alt");
    expect(hintFor("K", false)).toBe("K");
    expect(hintFor("G C", false)).toBe("G C");
    expect(hintFor("?", false)).toBe("?");
  });
});
