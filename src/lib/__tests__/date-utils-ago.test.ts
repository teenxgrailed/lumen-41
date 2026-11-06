import { formatDayAgo, formatTimeAgo } from "../date-utils";

const now = new Date("2026-11-05T12:00:00");

describe("formatDayAgo", () => {
  it("says today and yesterday in words", () => {
    expect(formatDayAgo(new Date("2026-11-05T01:00:00"), now)).toBe("today");
    expect(formatDayAgo(new Date("2026-11-04T23:00:00"), now)).toBe(
      "yesterday"
    );
  });
  it("writes older days in the viewer's locale, with the year only when it differs", () => {
    expect(formatDayAgo(new Date("2026-10-17T10:00:00"), now, "en-GB")).toBe(
      "17 Oct"
    );
    expect(formatDayAgo(new Date("2026-10-17T10:00:00"), now, "en-US")).toBe(
      "Oct 17"
    );
    expect(formatDayAgo(new Date("2025-10-17T10:00:00"), now, "en-GB")).toBe(
      "17 Oct 2025"
    );
  });
});

describe("formatTimeAgo", () => {
  it("counts minutes, then hours within the day, then days", () => {
    expect(formatTimeAgo(new Date("2026-11-05T11:59:40"), now)).toBe(
      "just now"
    );
    expect(formatTimeAgo(new Date("2026-11-05T11:48:00"), now)).toBe(
      "12 min ago"
    );
    expect(formatTimeAgo(new Date("2026-11-05T08:30:00"), now)).toBe("3 h ago");
    expect(formatTimeAgo(new Date("2026-11-04T20:00:00"), now)).toBe(
      "yesterday"
    );
  });
});
