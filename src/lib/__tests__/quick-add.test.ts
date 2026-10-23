import { parseQuickAdd, zoneOffsetMinutes } from "../quick-add";

// Wednesday 21 October 2026, 10:00 in Kyiv (07:00 UTC).
const now = new Date("2026-10-21T07:00:00Z");
const kyiv = { now, timeZone: "Europe/Kyiv" };

describe("parseQuickAdd", () => {
  it("leaves a plain title alone", () => {
    expect(parseQuickAdd("Write the brief", kyiv)).toEqual({
      title: "Write the brief",
      tokens: [],
    });
  });

  it("reads a day as a deadline at the end of that local day", () => {
    const r = parseQuickAdd("write brief tomorrow 2h #work !high", kyiv);
    expect(r.title).toBe("write brief");
    expect(r.deadline).toBe("2026-10-22T20:59:00.000Z");
    expect(r.start).toBeUndefined();
    expect(r).toMatchObject({
      estimatedMinutes: 120,
      project: "work",
      priorityLevel: "HIGH",
    });
  });

  it("reads a time as a start in the person's zone", () => {
    const r = parseQuickAdd("Call Anna tomorrow at 3pm", kyiv);
    expect(r.title).toBe("Call Anna");
    expect(r.start).toBe("2026-10-22T12:00:00.000Z");
  });

  it("reads Russian dates, times and units", () => {
    const r = parseQuickAdd("позвонить маме завтра в 15:00 30м", kyiv);
    expect(r.title).toBe("позвонить маме");
    expect(r.start).toBe("2026-10-22T12:00:00.000Z");
    expect(r.estimatedMinutes).toBe(30);
    expect(parseQuickAdd("отчёт 1.5ч", kyiv).estimatedMinutes).toBe(90);
  });

  it("puts a weekday in the future", () => {
    const r = parseQuickAdd("plan the sprint friday", kyiv);
    expect(r.deadline?.startsWith("2026-10-23")).toBe(true);
  });

  it("keeps hashtags inside words and numbers in titles", () => {
    const r = parseQuickAdd("Read chapter 12 of C#", kyiv);
    expect(r.project).toBeUndefined();
    expect(r.estimatedMinutes).toBeUndefined();
  });

  it("returns the typed tokens for highlighting", () => {
    const r = parseQuickAdd("gym today 45m", kyiv);
    expect(r.tokens.map((t) => t.kind).sort()).toEqual(["date", "duration"]);
  });
});

describe("zoneOffsetMinutes", () => {
  it("follows daylight saving", () => {
    expect(
      zoneOffsetMinutes("Europe/Kyiv", new Date("2026-07-01T00:00:00Z"))
    ).toBe(180);
    expect(
      zoneOffsetMinutes("Europe/Kyiv", new Date("2026-12-01T00:00:00Z"))
    ).toBe(120);
    expect(
      zoneOffsetMinutes("America/New_York", new Date("2026-12-01T00:00:00Z"))
    ).toBe(-300);
  });
});
