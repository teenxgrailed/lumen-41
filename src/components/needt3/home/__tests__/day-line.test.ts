/**
 * @jest-environment jsdom
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { V3Event } from "@/lib/needt3/map";

import { DayLine } from "../DayLine";
import {
  dayLine,
  firstEvent,
  firstEventText,
  weatherText,
} from "../day-line-model";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const TODAY = "2026-10-19";
const ev = (over: Partial<V3Event>): V3Event => ({
  id: "e",
  title: "Planning",
  startAt: `${TODAY}T10:00`,
  endAt: `${TODAY}T11:00`,
  isAllDay: false,
  calendarId: "c",
  source: "needt",
  externalId: null,
  ...over,
});
const W = { city: "Kyiv", temp: 14, min: 9, max: 17, summary: "Partly cloudy" };

describe("firstEvent", () => {
  it("is the earliest event still ahead today", () => {
    const f = firstEvent(
      [
        ev({ id: "a", startAt: `${TODAY}T14:00`, title: "Late" }),
        ev({ id: "b", startAt: `${TODAY}T08:00`, title: "Gone" }),
        ev({ id: "c", startAt: `${TODAY}T10:00`, title: "Next" }),
        ev({ id: "d", startAt: "2026-10-20T07:00", title: "Tomorrow" }),
        ev({ id: "e", isAllDay: true, title: "All day" }),
      ],
      TODAY,
      9
    );
    expect(f).toMatchObject({ title: "Next", at: "10:00" });
  });
  it("never says when to leave, even for an event with a place", () => {
    const f = firstEvent([ev({ location: "Office, Main St" })], TODAY, 9);
    expect(f).toEqual({ title: expect.any(String), at: "10:00" });
    expect(firstEventText(f!)).toBe("First event at 10:00");
  });
  it("is null when nothing is ahead", () => {
    expect(firstEvent([ev({})], TODAY, 11)).toBeNull();
  });
});

describe("dayLine", () => {
  const first = { title: "Planning", at: "10:00" };
  it("is hidden while the city is empty, whatever else is known", () => {
    expect(dayLine({ city: "", weather: W, first })).toBeNull();
    expect(dayLine({ city: "  ", weather: W, first })).toBeNull();
  });
  it("joins the weather and the first event", () => {
    expect(dayLine({ city: "Kyiv", weather: W, first })).toBe(
      "Kyiv · Partly cloudy 14° (9–17°) · First event at 10:00"
    );
    expect(weatherText(W)).toContain("14°");
  });
  it("keeps whichever half there is, and is null with neither", () => {
    expect(dayLine({ city: "Kyiv", weather: null, first })).toBe(
      "First event at 10:00"
    );
    expect(dayLine({ city: "Kyiv", weather: W, first: null })).toContain(
      "Partly cloudy"
    );
    expect(
      dayLine({ city: "Kyiv", weather: undefined, first: null })
    ).toBeNull();
  });
});

describe("DayLine", () => {
  it("draws nothing without text", async () => {
    const host = document.createElement("div");
    const root: Root = createRoot(host);
    await act(async () => root.render(h(DayLine, { text: null })));
    expect(host.innerHTML).toBe("");
    await act(async () => root.render(h(DayLine, { text: "Hello" })));
    expect(host.querySelector("[data-dl-line]")?.textContent).toBe("Hello");
    act(() => root.unmount());
  });
});
