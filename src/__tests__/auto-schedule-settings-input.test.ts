import {
  autoScheduleSettingsUpdateSchema,
  parseAutoScheduleSettingsUpdate,
} from "@/lib/auto-schedule-settings-input";

describe("what a person may set on their auto-schedule settings", () => {
  it("keeps the preference columns", () => {
    const body = {
      workDays: "[1,2,3,4,5]",
      workHourStart: 9,
      workHourEnd: 17,
      selectedCalendars: "[]",
      excludedCalendars: '["feed-1"]',
      bufferMinutes: 15,
      highEnergyStart: 8,
      highEnergyEnd: null,
      mediumEnergyStart: null,
      mediumEnergyEnd: null,
      lowEnergyStart: 14,
      lowEnergyEnd: 16,
      groupByProject: true,
      pushTasksToCalendar: true,
      pushTasksFeedId: "feed-1",
    };
    expect(autoScheduleSettingsUpdateSchema.parse(body)).toEqual(body);
  });

  it("drops identity, timestamp and unknown scalar fields", () => {
    const parsed = parseAutoScheduleSettingsUpdate({
      id: "row-of-someone-else",
      userId: "someone-else",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      isAdmin: true,
      bufferMinutes: 30,
    });
    expect(parsed).toEqual({ data: { bufferMinutes: 30 } });
  });

  it("refuses a nested value under an unknown key", () => {
    expect(
      parseAutoScheduleSettingsUpdate({
        user: { connect: { id: "someone-else" } },
      })
    ).toEqual({ error: "user is not a setting" });
    expect(parseAutoScheduleSettingsUpdate({ tags: ["a"] })).toEqual({
      error: "tags is not a setting",
    });
  });

  it("does not treat inherited names as settings", () => {
    expect(parseAutoScheduleSettingsUpdate({ constructor: {} })).toEqual({
      error: "constructor is not a setting",
    });
  });

  it("refuses a non-scalar value for a known column", () => {
    const parsed = parseAutoScheduleSettingsUpdate({
      workHourStart: { set: 3 },
    });
    expect(parsed).toHaveProperty("error");
    expect(
      parseAutoScheduleSettingsUpdate({ pushTasksFeedId: { connect: {} } })
    ).toHaveProperty("error");
    expect(
      parseAutoScheduleSettingsUpdate({ pushTasksFeedId: ["a"] })
    ).toHaveProperty("error");
  });

  it("refuses out-of-range and mistyped values", () => {
    for (const body of [
      { workHourStart: 24 },
      { workHourEnd: -1 },
      { bufferMinutes: 1.5 },
      { bufferMinutes: "15" },
      { groupByProject: "yes" },
      { pushTasksToCalendar: 1 },
      { pushTasksFeedId: "" },
      { workDays: "[7]" },
      { workDays: "not json" },
      { excludedCalendars: "[1]" },
    ]) {
      expect(parseAutoScheduleSettingsUpdate(body)).toHaveProperty("error");
    }
  });

  it("allows clearing the push calendar", () => {
    expect(parseAutoScheduleSettingsUpdate({ pushTasksFeedId: null })).toEqual({
      data: { pushTasksFeedId: null },
    });
  });
});
