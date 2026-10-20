/**
 * @jest-environment jsdom
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import type { CityPlace } from "@/lib/needt3/city";

import { CityField } from "../CityField";
import { PREF_DEFAULTS } from "../derive";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../ctx/PortalScope", () => ({
  useV3PortalContainer: () => document.body,
}));

const ZURICH: CityPlace = {
  name: "Zürich",
  admin1: "Zurich",
  country: "Switzerland",
  countryCode: "CH",
  latitude: 47.37,
  longitude: 8.55,
};
const SPRINGFIELD: CityPlace = {
  name: "Springfield",
  admin1: "Illinois",
  country: "United States",
  countryCode: "US",
  latitude: 39.8,
  longitude: -89.64,
};

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let fetchMock: jest.Mock;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ cities: [ZURICH, SPRINGFIELD] }),
  }));
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const input = () => host.querySelector("input") as HTMLInputElement;
const options = () => [...document.querySelectorAll('[role="option"]')];
/** Real time in short steps, so each step's updates are flushed. */
const wait = async (ms: number) => {
  for (let spent = 0; spent < ms; spent += 40) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
  }
};
const type = async (value: string) => {
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  await act(async () => {
    set?.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const key = (k: string) =>
  act(async () => {
    input().dispatchEvent(
      new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })
    );
  });
const render = (props: Partial<Parameters<typeof CityField>[0]> = {}) =>
  act(async () =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(CityField, {
          city: "",
          place: null,
          onPick: jest.fn(),
          ...props,
        })
      )
    )
  );

it("is empty by default, so Home shows no weather line", () => {
  expect(PREF_DEFAULTS.city).toBe("");
});

it("shows the picked city with its country, and an older typed one as it is", async () => {
  await render({ city: "Zürich", place: ZURICH });
  expect(input().value).toBe("Zürich, Switzerland");
  await render({ city: "Kyiv", place: null });
  expect(input().value).toBe("Kyiv");
});

it("suggests nothing for one letter, and asks once the typing settles", async () => {
  await render();
  await type("z");
  await wait(420);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("at least two letters");
  await type("zu");
  await type("zur");
  expect(fetchMock).not.toHaveBeenCalled();
  await wait(420);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0][0])).toBe("/api/weather/cities?q=zur");
  expect(options()).toHaveLength(2);
  expect(options()[0].textContent).toContain("Zürich");
  expect(options()[0].textContent).toContain("Zurich, Switzerland");
  expect(options()[0].textContent).toContain("CH");
});

it("picks with the keyboard: arrows move, Enter chooses", async () => {
  const onPick = jest.fn();
  await render({ onPick });
  await type("spr");
  await wait(420);
  expect(input().getAttribute("role")).toBe("combobox");
  expect(options()[0].getAttribute("aria-selected")).toBe("true");
  await key("ArrowDown");
  expect(options()[1].getAttribute("aria-selected")).toBe("true");
  expect(input().getAttribute("aria-activedescendant")).toBe(options()[1].id);
  await key("Enter");
  expect(onPick).toHaveBeenCalledWith(SPRINGFIELD);
  expect(options()).toHaveLength(0);
});

it("picks with the mouse", async () => {
  const onPick = jest.fn();
  await render({ onPick });
  await type("zur");
  await wait(420);
  await act(async () => {
    (options()[0] as HTMLElement).click();
  });
  expect(onPick).toHaveBeenCalledWith(ZURICH);
});

it("saves nothing while typing; Escape and leaving put the old city back", async () => {
  const onPick = jest.fn();
  await render({ city: "Zürich", place: ZURICH, onPick });
  await type("spr");
  await wait(420);
  await key("Escape");
  expect(onPick).not.toHaveBeenCalled();
  expect(input().value).toBe("Zürich, Switzerland");
  await type("spr");
  await act(async () => {
    input().dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  expect(onPick).not.toHaveBeenCalled();
  expect(input().value).toBe("Zürich, Switzerland");
});

it("does not save the city that is already chosen", async () => {
  const onPick = jest.fn();
  await render({ city: "Zürich", place: ZURICH, onPick });
  await type("zur");
  await wait(420);
  await key("Enter");
  expect(onPick).not.toHaveBeenCalled();
});

it("clears with the cross", async () => {
  const onPick = jest.fn();
  await render({ city: "Zürich", place: ZURICH, onPick });
  const clear = host.querySelector(".city-clear") as HTMLButtonElement;
  expect(clear.getAttribute("aria-label")).toBe("Clear city");
  await act(async () => clear.click());
  expect(onPick).toHaveBeenCalledWith(null);
  await render({ city: "", place: null, onPick });
  expect(host.querySelector(".city-clear")).toBeNull();
});

it("says so when nothing matches or the suggestions are down", async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ cities: [] }),
  });
  await render();
  await type("qqq");
  await wait(420);
  expect(document.body.textContent).toContain("No city found");
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 502,
    statusText: "Bad Gateway",
    text: async () => JSON.stringify({ error: "City search is unavailable." }),
  });
  await type("zzz");
  await wait(420);
  expect(document.body.textContent).toContain("unavailable");
});

it("stays off until the settings are known", async () => {
  await render({ disabled: true });
  expect(input().disabled).toBe(true);
});
