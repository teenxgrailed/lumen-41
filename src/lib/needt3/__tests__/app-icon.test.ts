import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  APP_ICONS,
  APP_ICON_PREF,
  DEFAULT_APP_ICON,
  SEEN_ICON_PICKER_PREF,
  appIconFromPrefs,
  appIconLocked,
  appIconPrefsError,
  iconLinkHref,
  nativeIconName,
  seenIconPickerFromPrefs,
  shouldShowIconPicker,
} from "../app-icon";

const FREE = ["midnight", "ink", "sky", "paper"];

describe("app icon: the pack", () => {
  it("has thirteen icons and exactly four free ones", () => {
    expect(APP_ICONS).toHaveLength(13);
    expect(
      APP_ICONS.filter((i) => i.tier === "free")
        .map((i) => i.id)
        .sort()
    ).toEqual([...FREE].sort());
  });

  it("ships every icon's files under public/app-icons", () => {
    for (const { id } of APP_ICONS) {
      for (const f of ["icon.svg", "apple-touch-icon.png", "favicon.png"])
        expect(existsSync(join("public/app-icons", id, f))).toBe(true);
    }
  });

  it("makes Midnight the default everywhere (brand mark, favicons, manifest)", () => {
    expect(DEFAULT_APP_ICON).toBe("midnight");
    expect(readFileSync("public/brand/needt-icon.svg", "utf8")).toBe(
      readFileSync("public/app-icons/midnight/icon.svg", "utf8")
    );
    expect(readFileSync("public/icons/apple-touch-icon.png")).toEqual(
      readFileSync("public/app-icons/midnight/apple-touch-icon.png")
    );
  });
});

describe("app icon: default and saved choice", () => {
  it("is Midnight when nothing is saved or the value is unknown", () => {
    expect(appIconFromPrefs(undefined)).toBe("midnight");
    expect(appIconFromPrefs({})).toBe("midnight");
    expect(appIconFromPrefs({ [APP_ICON_PREF]: "nope" })).toBe("midnight");
    expect(appIconFromPrefs({ [APP_ICON_PREF]: 3 })).toBe("midnight");
  });

  it("reads a saved icon", () => {
    expect(appIconFromPrefs({ [APP_ICON_PREF]: "aurora" })).toBe("aurora");
  });
});

describe("app icon: tier gating", () => {
  it("locks the nine Pro icons on Free and none of the four free ones", () => {
    const locked = APP_ICONS.filter((i) => appIconLocked(i.id, "free"));
    expect(locked).toHaveLength(9);
    for (const id of FREE) expect(appIconLocked(id, "free")).toBe(false);
    expect(appIconLocked("aurora", "free")).toBe(true);
  });

  it("unlocks everything on a trial and on every paid plan", () => {
    for (const kind of ["trial", "monthly", "yearly", "lifetime"])
      for (const { id } of APP_ICONS)
        expect(appIconLocked(id, kind)).toBe(false);
  });

  it("treats an unknown plan as Free", () => {
    expect(appIconLocked("aurora", undefined)).toBe(true);
    expect(appIconLocked("aurora", null)).toBe(true);
  });
});

describe("app icon: the one-time popup", () => {
  it("reads the flag from prefs", () => {
    expect(seenIconPickerFromPrefs({})).toBe(false);
    expect(seenIconPickerFromPrefs(undefined)).toBe(false);
    expect(seenIconPickerFromPrefs({ [SEEN_ICON_PICKER_PREF]: "yes" })).toBe(
      false
    );
    expect(seenIconPickerFromPrefs({ [SEEN_ICON_PICKER_PREF]: true })).toBe(
      true
    );
  });

  it("shows once: only when loaded, unseen, and not under automation", () => {
    expect(shouldShowIconPicker({ loaded: true, seen: false })).toBe(true);
    expect(shouldShowIconPicker({ loaded: false, seen: false })).toBe(false);
    expect(shouldShowIconPicker({ loaded: true, seen: true })).toBe(false);
    expect(
      shouldShowIconPicker({ loaded: true, seen: false, automated: true })
    ).toBe(false);
  });
});

describe("app icon: head links and native names", () => {
  it("points the svg favicon, png favicons and touch icon at the choice", () => {
    expect(iconLinkHref("icon", "image/svg+xml", "sky")).toBe(
      "/app-icons/sky/icon.svg"
    );
    expect(iconLinkHref("icon", "image/png", "sky")).toBe(
      "/app-icons/sky/favicon.png"
    );
    expect(iconLinkHref("apple-touch-icon", null, "sky")).toBe(
      "/app-icons/sky/apple-touch-icon.png"
    );
    expect(iconLinkHref("stylesheet", null, "sky")).toBeNull();
  });

  it("uses the primary iOS icon for Midnight and AppIcon-<id> otherwise", () => {
    expect(nativeIconName("midnight")).toBeNull();
    expect(nativeIconName("pearl")).toBe("AppIcon-pearl");
  });
});

describe("app icon: prefs validation (the API field)", () => {
  it("accepts a known icon and a boolean flag", () => {
    expect(
      appIconPrefsError({ appIcon: "ember", seenIconPicker: true })
    ).toBeNull();
    expect(appIconPrefsError({ accent: "blue" })).toBeNull();
  });

  it("rejects an unknown icon and a non-boolean flag", () => {
    expect(appIconPrefsError({ appIcon: "neon" })).toBe("Invalid app icon");
    expect(appIconPrefsError({ seenIconPicker: "true" })).toBe(
      "Invalid seenIconPicker"
    );
  });
});
