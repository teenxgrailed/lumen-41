/**
 * @jest-environment jsdom
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { HaWeather } from "../ha/HaWeather";
import { haWeatherOf } from "../ha/model";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const weather = {
  city: "Kyiv",
  temp: 17,
  min: 9,
  max: 19,
  code: 0,
  summary: "Clear",
  feelsLike: 15,
  precipChance: 20,
  windKph: 12,
  sunrise: "07:12",
  sunset: "17:31",
  hours: [
    { time: "15:00", temp: 17, code: 0, precipChance: 0 },
    { time: "16:00", temp: 16, code: 2, precipChance: 5 },
    { time: "17:00", temp: 14, code: 3, precipChance: 10 },
    { time: "18:00", temp: 12, code: 61, precipChance: 40 },
  ],
};
const wx = haWeatherOf({ city: "Kyiv", weather, first: null });
const render = (el: Parameters<Root["render"]>[0]) =>
  act(async () => root.render(el));
const card = () => host.querySelector("[data-ha-wx-card]");

describe("HaWeather detail card", () => {
  it("is closed until hover, then names every detail", async () => {
    await render(h(HaWeather, { wx }));
    expect(card()).toBeNull();
    await act(async () => {
      // React derives mouseenter from mouseover.
      host
        .querySelector(".ha-wx")!
        .dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(card()).not.toBeNull();
    const text = card()!.textContent ?? "";
    for (const part of [
      "Kyiv",
      "Feels like15°",
      "High / low19° / 9°",
      "Precipitation20%",
      "Wind12 km/h",
      "Sunrise07:12",
      "Sunset17:31",
      "15:00",
      "18:00",
    ])
      expect(text).toContain(part);
    expect(card()!.querySelectorAll(".ha-wx-card-hours li")).toHaveLength(4);
  });

  it("opens on keyboard focus and closes on Escape and on blur", async () => {
    await render(h(HaWeather, { wx }));
    const btn = host.querySelector(".ha-wx-btn") as HTMLButtonElement;
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    await act(async () => btn.focus());
    expect(card()).not.toBeNull();
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(btn.getAttribute("aria-controls")).toBe(card()!.id);
    await act(async () => {
      btn.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(card()).toBeNull();
    await act(async () => btn.focus());
    await act(async () => btn.blur());
    expect(card()).toBeNull();
  });

  it("leaves out rows the service did not know", async () => {
    const bare = haWeatherOf({
      city: "Kyiv",
      weather: {
        ...weather,
        precipChance: null,
        windKph: null,
        sunrise: null,
        sunset: null,
        hours: [],
      },
      first: null,
    });
    await render(h(HaWeather, { wx: bare }));
    await act(async () => {
      (host.querySelector(".ha-wx-btn") as HTMLButtonElement).focus();
    });
    const text = card()!.textContent ?? "";
    expect(text).toContain("Feels like");
    expect(text).not.toMatch(/Precipitation|Wind|Sunrise|Sunset/);
    expect(card()!.querySelector(".ha-wx-card-hours")).toBeNull();
  });
});
