import {
  draftOf,
  draftProblem,
  editedTimes,
  hasCustomRepeat,
  patchFor,
} from "../personal-time-edit";

const TZ = "Europe/Zurich";
// Mon 2026-10-19, 13:00-14:00 Zurich (UTC+2)
const lunch = {
  title: "Lunch",
  start: "2026-10-19T11:00:00.000Z",
  end: "2026-10-19T12:00:00.000Z",
  rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
};

describe("personal-time-edit", () => {
  it("opens with the block's own clock and weekdays", () => {
    expect(draftOf(lunch, TZ)).toEqual({
      title: "Lunch",
      startAt: "13:00",
      endAt: "14:00",
      days: [1, 2, 3, 4, 5],
    });
  });

  it("sends nothing for an untouched form", () => {
    expect(patchFor(lunch, draftOf(lunch, TZ), TZ)).toEqual({});
  });

  it("sends only the title when only the title changed", () => {
    const draft = { ...draftOf(lunch, TZ), title: "Long lunch" };
    expect(patchFor(lunch, draft, TZ)).toEqual({ title: "Long lunch" });
  });

  it("moves the time on the block's own day", () => {
    const draft = { ...draftOf(lunch, TZ), startAt: "12:30", endAt: "13:45" };
    expect(patchFor(lunch, draft, TZ)).toEqual({
      start: "2026-10-19T10:30:00.000Z",
      end: "2026-10-19T11:45:00.000Z",
    });
  });

  it("rolls an end before the start to the next day", () => {
    expect(editedTimes(lunch, TZ, "22:00", "01:00")).toEqual({
      start: "2026-10-19T20:00:00.000Z",
      end: "2026-10-19T23:00:00.000Z",
    });
  });

  it("keeps a block that already ends the next day on its two days", () => {
    const party = {
      start: "2026-10-23T18:00:00.000Z", // 20:00 Zurich
      end: "2026-10-23T22:00:00.000Z", // 00:00 the next day
    };
    expect(editedTimes(party, TZ, "21:00", "01:00")).toEqual({
      start: "2026-10-23T19:00:00.000Z",
      end: "2026-10-23T23:00:00.000Z",
    });
  });

  it("changes the repeat: weekdays to every day, to some days, to none", () => {
    const base = draftOf(lunch, TZ);
    expect(
      patchFor(lunch, { ...base, days: [0, 1, 2, 3, 4, 5, 6] }, TZ)
    ).toEqual({ rrule: "FREQ=DAILY" });
    expect(patchFor(lunch, { ...base, days: [] }, TZ)).toEqual({
      rrule: null,
    });
    expect(patchFor(lunch, { ...base, days: [1, 3] }, TZ)).toEqual({
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE",
    });
  });

  it("turns a one-off into a repeat", () => {
    const once = { ...lunch, rrule: null };
    const draft = { ...draftOf(once, TZ), days: [1, 2] };
    expect(patchFor(once, draft, TZ)).toEqual({
      rrule: "FREQ=WEEKLY;BYDAY=MO,TU",
    });
  });

  it("leaves a repeat the chips cannot show alone", () => {
    const monthly = { ...lunch, rrule: "FREQ=MONTHLY;BYMONTHDAY=1" };
    expect(hasCustomRepeat(monthly)).toBe(true);
    const draft = { ...draftOf(monthly, TZ), title: "Rent walk" };
    expect(patchFor(monthly, draft, TZ)).toEqual({ title: "Rent walk" });
  });

  it("changes only the name of a block linked to an event", () => {
    const linked = { ...lunch, rrule: null, sourceEventId: "ev1" };
    const draft = {
      ...draftOf(linked, TZ),
      title: "Standup",
      startAt: "09:00",
      days: [1],
    };
    expect(patchFor(linked, draft, TZ)).toEqual({ title: "Standup" });
  });

  it("rejects an empty name and a zero-length block", () => {
    const base = draftOf(lunch, TZ);
    expect(draftProblem({ ...base, title: "  " })).toMatch(/name/);
    expect(draftProblem({ ...base, endAt: base.startAt })).toMatch(/end/);
    expect(draftProblem(base)).toBeNull();
  });
});
