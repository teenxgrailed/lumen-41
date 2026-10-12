import { inspectorTab, isPanelShortcut } from "../panel";

const key = (
  o: Partial<{
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    code: string;
    altGraph: boolean;
  }>
) => ({
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  code: "Backslash",
  getModifierState: (k: string) => k === "AltGraph" && !!o.altGraph,
  ...o,
});

describe("isPanelShortcut", () => {
  it("is Cmd+Alt+\\ or Ctrl+Alt+\\ on the physical key", () => {
    expect(isPanelShortcut(key({ metaKey: true, altKey: true }))).toBe(true);
    expect(isPanelShortcut(key({ ctrlKey: true, altKey: true }))).toBe(true);
  });

  it("is not a bare backslash, Cmd+\\ (the sidebar's) or another key", () => {
    expect(isPanelShortcut(key({}))).toBe(false);
    expect(isPanelShortcut(key({ metaKey: true }))).toBe(false);
    expect(
      isPanelShortcut(key({ metaKey: true, altKey: true, code: "KeyA" }))
    ).toBe(false);
  });

  it("is never AltGr + a key: that is a character being typed", () => {
    // German, Nordic and Polish layouts type "\\" with AltGr, which reports
    // Ctrl+Alt with the AltGraph modifier set.
    expect(
      isPanelShortcut(key({ ctrlKey: true, altKey: true, altGraph: true }))
    ).toBe(false);
  });
});

describe("inspectorTab", () => {
  it("shows Style when a database page is asked for Insert", () => {
    expect(inspectorTab("insert", true)).toBe("style");
    expect(inspectorTab("insert", false)).toBe("insert");
    expect(inspectorTab("info", true)).toBe("info");
    expect(inspectorTab("style", true)).toBe("style");
  });
});
