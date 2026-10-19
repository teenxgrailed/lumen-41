import ICAL from "ical.js";

import { convertVEventToCalendarEvent } from "@/lib/caldav-helpers";

jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

function vevent(extra: string) {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:evt-1",
    "DTSTART:20261020T090000Z",
    "DTEND:20261020T100000Z",
    "SUMMARY:Sync",
    extra,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
  return new ICAL.Component(ICAL.parse(ics)).getFirstSubcomponent("vevent")!;
}

describe("CalDAV event availability", () => {
  it("treats a plain event as blocking", () => {
    const event = convertVEventToCalendarEvent(vevent(""), ["me@example.com"]);
    expect(event).toMatchObject({ transparent: false, selfDeclined: false });
  });

  it("marks TRANSP:TRANSPARENT as not blocking", () => {
    const event = convertVEventToCalendarEvent(vevent("TRANSP:TRANSPARENT"));
    expect(event.transparent).toBe(true);
  });

  it("marks a FREE busy status as not blocking", () => {
    const event = convertVEventToCalendarEvent(
      vevent("X-MICROSOFT-CDO-BUSYSTATUS:FREE")
    );
    expect(event.transparent).toBe(true);
  });

  it("marks an invitation the user declined", () => {
    const event = convertVEventToCalendarEvent(
      vevent("ATTENDEE;PARTSTAT=DECLINED:mailto:Me@Example.com"),
      ["me@example.com"]
    );
    expect(event.selfDeclined).toBe(true);
  });

  it("ignores another attendee's decline", () => {
    const event = convertVEventToCalendarEvent(
      vevent("ATTENDEE;PARTSTAT=DECLINED:mailto:other@example.com"),
      ["me@example.com"]
    );
    expect(event.selfDeclined).toBe(false);
  });
});
