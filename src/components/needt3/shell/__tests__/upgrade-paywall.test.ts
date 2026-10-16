/**
 * Every Upgrade control in the shell, Home and Settings opens the one paywall
 * (`openPaywall`), never a settings page and never nothing. Source-level: the
 * screens are too wide to mount for one click.
 */
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) =>
  readFileSync(join(__dirname, "..", "..", ...p), "utf8");

describe("Upgrade opens the paywall", () => {
  it("the account menu's Upgrade button", () => {
    const src = read("shell", "AccountMenu.tsx");
    expect(src).toContain("onClick={run(() => openPaywall())}");
    expect(src).not.toContain("S1 paywall");
  });

  it("Home's locked Plan my day and Week ahead load", () => {
    const src = read("home", "HomeScreen.tsx");
    expect(src).toContain('onLocked={upgrade("Plan my day")}');
    expect(src).toContain('onUpgrade={upgrade("Week ahead")}');
    expect(src).not.toContain('openSettings("billing")');
  });

  it("Settings → Appearance", () => {
    const src = read("settings", "SettingsSheet.tsx");
    expect(src).toContain("onUpgrade={(feature) => openPaywall(feature)}");
  });

  it("no screen sends an Upgrade to /settings#billing any more", () => {
    for (const f of [
      ["places", "MoodboardsScreen.tsx"],
      ["home", "HomeScreen.tsx"],
    ])
      expect(read(...f)).not.toContain("settings#billing");
  });
});
