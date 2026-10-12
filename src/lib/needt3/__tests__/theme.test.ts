import { newDateFromYMD } from "@/lib/date-utils";
import {
  ACCENTS,
  type TimePalettes,
  normalizeAccent,
  normalizeTheme,
  resolveTheme,
  timeThemeAt,
} from "@/lib/needt3/theme";

const PALETTES: TimePalettes = {
  day: { side: "light", bg: "#fcfdfe", raised: "#ffffff", ink: "#1a1c1e" },
  dawn: { side: "light", bg: "#edf2f9", raised: "#f8fafd", ink: "#181e28" },
  golden: { side: "light", bg: "#fbf1e2", raised: "#fffaf1", ink: "#281f16" },
  dusk: { side: "light", bg: "#efe5ec", raised: "#f9f2f6", ink: "#241c2a" },
  duskDark: { side: "dark", bg: "#25222b", raised: "#312d38", ink: "#eeebf2" },
  dawnDark: { side: "dark", bg: "#1f242b", raised: "#2a3038", ink: "#ebeef3" },
  night: { side: "dark", bg: "#202022", raised: "#2c2c2e", ink: "#ececec" },
};

const ZURICH = {
  tz: "Europe/Zurich",
  name: "Zürich",
  lat: 47.37,
  lon: 8.54,
  exact: true,
};

/** A local wall-clock moment, independent of the machine's zone offset. */
function at(hour: number) {
  const d = newDateFromYMD(2026, 5, 21);
  d.setHours(hour);
  return d;
}

describe("theme model", () => {
  it("offers six solid accents, then three gradients", () => {
    expect(ACCENTS.filter((a) => !a.gradient)).toHaveLength(6);
    expect(ACCENTS.slice(6).every((a) => a.gradient)).toBe(true);
  });

  it("maps legacy theme names onto the four", () => {
    expect(normalizeTheme("paper")).toBe("light");
    expect(normalizeTheme("warm")).toBe("light");
    expect(normalizeTheme("dim")).toBe("dark");
    expect(normalizeTheme("time")).toBe("time");
    expect(normalizeTheme("nonsense")).toBe("system");
    expect(normalizeAccent("aurora")).toBe("aurora");
    expect(normalizeAccent("red")).toBe("blue");
  });

  it("resolves System from the OS and never sets drift outside Time", () => {
    expect(resolveTheme("system", true)).toEqual({
      side: "dark",
      drift: false,
      vars: {},
    });
    expect(resolveTheme("system", false).side).toBe("light");
    expect(resolveTheme("dark", false).side).toBe("dark");
    expect(resolveTheme("light", true).side).toBe("light");
  });

  it("Time is Light exactly at midday and Dark exactly at midnight", () => {
    const noon = timeThemeAt(at(13), ZURICH, PALETTES);
    expect(noon.side).toBe("light");
    expect(noon.pure).toBe(true);
    expect(noon.vars).toEqual({});
    expect(resolveTheme("time", false, noon).drift).toBe(true);

    const midnight = timeThemeAt(at(0), ZURICH, PALETTES);
    expect(midnight.side).toBe("dark");
    expect(midnight.pure).toBe(true);
  });
});
