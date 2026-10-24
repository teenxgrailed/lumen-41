import {
  TZ_AUTO_SET_PREF,
  firstRunLocalePatch,
  isValidTimeZone,
  localeDefaults,
  regionOf,
  signupLocaleSettings,
} from "@/lib/needt3/locale-defaults";

const fresh = {
  timeZone: "UTC",
  weekStartDay: "sunday",
  timeFormat: "12h",
  prefs: {} as Record<string, unknown>,
};

describe("localeDefaults", () => {
  it("most of Europe: Monday and 24h", () => {
    for (const lang of ["de-DE", "fr-FR", "en-GB", "uk-UA", "pl", "de"])
      expect(localeDefaults(lang)).toEqual({
        weekStartDay: "monday",
        timeFormat: "24h",
      });
  });

  it("en-US: Sunday and 12h", () => {
    expect(localeDefaults("en-US")).toEqual({
      weekStartDay: "sunday",
      timeFormat: "12h",
    });
    // a bare "en" is likely the US
    expect(localeDefaults("en")).toEqual({
      weekStartDay: "sunday",
      timeFormat: "12h",
    });
  });

  it("Sunday regions outside the US keep Sunday", () => {
    expect(localeDefaults("pt-BR")?.weekStartDay).toBe("sunday");
    expect(localeDefaults("ja-JP")?.weekStartDay).toBe("sunday");
    expect(localeDefaults("he-IL")?.weekStartDay).toBe("sunday");
  });

  it("nothing usable: null", () => {
    expect(localeDefaults(undefined)).toBeNull();
    expect(localeDefaults("")).toBeNull();
    expect(localeDefaults("not a locale!!")).toBeNull();
  });

  it("regionOf reads or infers the region", () => {
    expect(regionOf("de-AT")).toBe("AT");
    expect(regionOf("de_CH")).toBe("CH");
    expect(regionOf("de")).toBe("DE");
    expect(regionOf(null)).toBeNull();
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones, refuses the rest", () => {
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
    expect(isValidTimeZone("x".repeat(80))).toBe(false);
  });
});

describe("firstRunLocalePatch", () => {
  const berlin = { timeZone: "Europe/Berlin", language: "de-DE" };

  it("a fresh UTC account takes the browser's zone, week and clock", () => {
    expect(firstRunLocalePatch(fresh, berlin)).toEqual({
      timeZone: "Europe/Berlin",
      weekStartDay: "monday",
      timeFormat: "24h",
      prefs: { [TZ_AUTO_SET_PREF]: true },
    });
  });

  it("keeps the other prefs it merges into", () => {
    const patch = firstRunLocalePatch(
      { ...fresh, prefs: { accent: "blue" } },
      berlin
    );
    expect(patch?.prefs).toEqual({ accent: "blue", [TZ_AUTO_SET_PREF]: true });
  });

  it("Etc/UTC counts as unset too", () => {
    expect(
      firstRunLocalePatch({ ...fresh, timeZone: "Etc/UTC" }, berlin)?.timeZone
    ).toBe("Europe/Berlin");
  });

  it("never runs twice", () => {
    expect(
      firstRunLocalePatch(
        { ...fresh, prefs: { [TZ_AUTO_SET_PREF]: true } },
        berlin
      )
    ).toBeNull();
  });

  it("a zone already chosen is only marked, never replaced", () => {
    expect(
      firstRunLocalePatch(
        { ...fresh, timeZone: "America/New_York", timeFormat: "12h" },
        berlin
      )
    ).toEqual({ prefs: { [TZ_AUTO_SET_PREF]: true } });
  });

  it("a week start or clock already changed is left alone", () => {
    expect(
      firstRunLocalePatch(
        { ...fresh, weekStartDay: "saturday", timeFormat: "24h" },
        { timeZone: "America/Chicago", language: "en-US" }
      )
    ).toEqual({
      timeZone: "America/Chicago",
      prefs: { [TZ_AUTO_SET_PREF]: true },
    });
  });

  it("en-US keeps the Sunday / 12h defaults and only sets the zone", () => {
    expect(
      firstRunLocalePatch(fresh, {
        timeZone: "America/Los_Angeles",
        language: "en-US",
      })
    ).toEqual({
      timeZone: "America/Los_Angeles",
      prefs: { [TZ_AUTO_SET_PREF]: true },
    });
  });

  it("waits when the browser knows no better zone", () => {
    expect(
      firstRunLocalePatch(fresh, { timeZone: "UTC", language: "de-DE" })
    ).toBeNull();
    expect(
      firstRunLocalePatch(fresh, { timeZone: "Bad/Zone", language: "de-DE" })
    ).toBeNull();
    expect(
      firstRunLocalePatch(fresh, { timeZone: undefined, language: "de-DE" })
    ).toBeNull();
  });

  it("no language: the zone alone", () => {
    expect(
      firstRunLocalePatch(fresh, { timeZone: "Europe/Kyiv", language: null })
    ).toEqual({
      timeZone: "Europe/Kyiv",
      prefs: { [TZ_AUTO_SET_PREF]: true },
    });
  });
});

describe("signupLocaleSettings", () => {
  it("a valid zone and language become the new row's columns", () => {
    expect(
      signupLocaleSettings({ timeZone: "Europe/Paris", locale: "fr-FR" })
    ).toEqual({
      timeZone: "Europe/Paris",
      weekStartDay: "monday",
      timeFormat: "24h",
      prefs: { [TZ_AUTO_SET_PREF]: true },
    });
  });

  it("a zone without a language sets only the zone", () => {
    expect(signupLocaleSettings({ timeZone: "Europe/Paris" })).toEqual({
      timeZone: "Europe/Paris",
      prefs: { [TZ_AUTO_SET_PREF]: true },
    });
  });

  it("missing, invalid or UTC: nothing, the first load decides", () => {
    expect(signupLocaleSettings({})).toEqual({});
    expect(signupLocaleSettings({ timeZone: "Nope/Nope" })).toEqual({});
    expect(signupLocaleSettings({ timeZone: "UTC", locale: "de" })).toEqual({});
    expect(signupLocaleSettings({ timeZone: 5, locale: "de" })).toEqual({});
  });
});
