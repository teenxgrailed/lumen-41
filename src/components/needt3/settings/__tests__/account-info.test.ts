import { describeDevice, deviceLine, signInMethods } from "../account-info";

describe("signInMethods", () => {
  it("puts the password first, then providers in the sign-in screen's order", () => {
    expect(
      signInMethods([
        "twitter",
        "github",
        "credentials",
        "apple",
        "google",
      ]).map((m) => m.id)
    ).toEqual(["credentials", "google", "apple", "github", "twitter"]);
  });

  it("names providers the way people know them", () => {
    expect(signInMethods(["azure-ad", "twitter"]).map((m) => m.label)).toEqual([
      "Microsoft",
      "X",
    ]);
  });

  it("ignores accounts that are not a sign-in method", () => {
    expect(signInMethods(["oauth", "caldav"])).toEqual([]);
    expect(signInMethods([])).toEqual([]);
  });
});

describe("describeDevice", () => {
  it("reads the browser and the system", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
      )
    ).toBe("Chrome on macOS");
    expect(
      describeDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
      )
    ).toBe("Safari on iOS");
    expect(
      describeDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0"
      )
    ).toBe("Edge on Windows");
  });

  it("falls back without inventing", () => {
    expect(describeDevice("")).toBe("This browser");
    expect(describeDevice(null)).toBe("This browser");
  });
});

describe("deviceLine", () => {
  it("states when the session ends", () => {
    expect(deviceLine("Firefox/130.0 Linux", "2026-11-13T10:00:00.000Z")).toBe(
      "Firefox on Linux · active now · signed in until 13 Nov"
    );
  });

  it("drops the date when the session has none", () => {
    expect(deviceLine("Firefox/130.0 Linux", null)).toBe(
      "Firefox on Linux · active now"
    );
    expect(deviceLine("Firefox/130.0 Linux", "nope")).toBe(
      "Firefox on Linux · active now"
    );
  });
});
