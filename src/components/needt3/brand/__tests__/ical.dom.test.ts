/** @jest-environment jsdom */
import { act, createElement as h } from "react";

import { createRoot, hydrateRoot } from "react-dom/client";

import { BrandIcon } from "../BrandIcon";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** The server render, as the page would receive it (jsdom would pick the browser build). */
/* eslint-disable @typescript-eslint/no-require-imports */
const serverMarkup = (el: ReturnType<typeof h>): string => {
  const server = require("react-dom/server.node");
  return (server as typeof import("react-dom/server")).renderToString(el);
};
/* eslint-enable @typescript-eslint/no-require-imports */

/** Only the clock is faked: act() and React's scheduler keep their real timers. */
const fakeDay = () =>
  jest.useFakeTimers({
    now: new Date("2026-10-12T12:00:00Z"),
    doNotFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "setImmediate",
      "clearImmediate",
      "queueMicrotask",
      "nextTick",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "performance",
    ],
  });

describe("Apple Calendar tile", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("the server markup is a calendar face with placeholders, never a blank square", () => {
    const html = serverMarkup(h(BrandIcon, { id: "ical", size: 40 }));
    expect(html).toContain('data-ical-face="neutral"');
    expect(html).toContain("<rect");
    expect(html).not.toContain("<text");
  });

  it("shows the weekday and the date once hydrated, with no hydration warning", async () => {
    fakeDay();
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const host = document.createElement("div");
    document.body.appendChild(host);
    host.innerHTML = serverMarkup(h(BrandIcon, { id: "ical", size: 40 }));
    expect(host.innerHTML).toContain('data-ical-face="neutral"');

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(host, h(BrandIcon, { id: "ical", size: 40 }));
    });
    expect(host.innerHTML).toContain('data-ical-face="date"');
    expect(host.textContent).toContain("MON");
    expect(host.textContent).toContain("12");
    expect(errors).not.toHaveBeenCalled();
    act(() => root?.unmount());
    errors.mockRestore();
    host.remove();
  });

  it("a client mount draws the date at once", async () => {
    fakeDay();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(h(BrandIcon, { id: "ical", size: 36 }));
    });
    expect(host.textContent).toContain("12");
    act(() => root.unmount());
    host.remove();
  });
});
