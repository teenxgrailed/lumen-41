import {
  DEFAULT_PREFS,
  digestDue,
  inQuietHours,
  prefsFrom,
  shouldAlert,
  typeOfFeedKind,
} from "../preferences";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const berlin = { ...DEFAULT_PREFS, timeZone: "Europe/Berlin" };
// 28 Oct 2026, Berlin is UTC+1.
const at = (hhmm: string) => new Date(`2026-10-28T${hhmm}:00.000+01:00`);

describe("inQuietHours", () => {
  const quiet = { ...berlin, quietHours: true };
  it("covers a window that crosses midnight", () => {
    expect(inQuietHours(quiet, at("23:30"))).toBe(true);
    expect(inQuietHours(quiet, at("03:00"))).toBe(true);
    expect(inQuietHours(quiet, at("07:59"))).toBe(true);
    expect(inQuietHours(quiet, at("08:00"))).toBe(false);
    expect(inQuietHours(quiet, at("21:59"))).toBe(false);
  });

  it("covers a window inside one day", () => {
    const lunch = { ...quiet, quietStart: "12:00", quietEnd: "13:00" };
    expect(inQuietHours(lunch, at("12:30"))).toBe(true);
    expect(inQuietHours(lunch, at("13:00"))).toBe(false);
  });

  it("is off when switched off or when start equals end", () => {
    expect(inQuietHours(berlin, at("23:30"))).toBe(false);
    expect(
      inQuietHours(
        { ...quiet, quietStart: "09:00", quietEnd: "09:00" },
        at("09:00")
      )
    ).toBe(false);
  });

  it("reads the wall clock in the person's zone", () => {
    const utc = { ...quiet, timeZone: "UTC" };
    // 07:30 in Berlin is 06:30 UTC: quiet in both.
    expect(inQuietHours(utc, at("07:30"))).toBe(true);
    // 08:30 in Berlin is 07:30 UTC: quiet only in UTC.
    expect(inQuietHours(utc, at("08:30"))).toBe(true);
    expect(inQuietHours(quiet, at("08:30"))).toBe(false);
  });
});

describe("shouldAlert", () => {
  it("needs the type and the channel switched on", () => {
    expect(shouldAlert(berlin, "reminder", "push", at("10:00"))).toBe(true);
    expect(
      shouldAlert(
        { ...berlin, reminders: false },
        "reminder",
        "push",
        at("10:00")
      )
    ).toBe(false);
    expect(
      shouldAlert(
        { ...berlin, channelMac: false },
        "reminder",
        "mac",
        at("10:00")
      )
    ).toBe(false);
  });

  it("holds pushes in quiet hours but not the in-app record", () => {
    const quiet = { ...berlin, quietHours: true };
    expect(shouldAlert(quiet, "reminder", "push", at("23:00"))).toBe(false);
    expect(shouldAlert(quiet, "reminder", "inApp", at("23:00"))).toBe(true);
  });

  it("sends nothing one by one in digest mode", () => {
    const digest = { ...berlin, digest: true };
    expect(shouldAlert(digest, "mention", "push", at("10:00"))).toBe(false);
    expect(shouldAlert(digest, "mention", "email", at("10:00"))).toBe(false);
    expect(shouldAlert(digest, "mention", "inApp", at("10:00"))).toBe(true);
  });
});

describe("digestDue", () => {
  const digest = { ...berlin, digest: true, digestTime: "08:00" };
  it("is due once a day, at or after its time", () => {
    expect(digestDue(digest, null, at("07:59"))).toBe(false);
    expect(digestDue(digest, null, at("08:00"))).toBe(true);
    expect(digestDue(digest, at("08:01"), at("09:00"))).toBe(false);
    expect(
      digestDue(digest, new Date("2026-10-27T08:00:00.000+01:00"), at("08:05"))
    ).toBe(true);
  });
  it("is never due when the digest is off", () => {
    expect(digestDue(berlin, null, at("09:00"))).toBe(false);
  });
});

describe("typeOfFeedKind and prefsFrom", () => {
  it("maps feed rows to the switches", () => {
    expect(typeOfFeedKind("reminder")).toBe("reminder");
    expect(typeOfFeedKind("overdue")).toBe("overdue");
    expect(typeOfFeedKind("comment")).toBe("mention");
    expect(typeOfFeedKind("share")).toBe("mention");
    expect(typeOfFeedKind("sync")).toBe("system");
  });
  it("fills the defaults and a safe zone", () => {
    const prefs = prefsFrom({ digest: true }, "Not/AZone");
    expect(prefs.digest).toBe(true);
    expect(prefs.channelPush).toBe(true);
    expect(prefs.timeZone).toBe("UTC");
  });
});
