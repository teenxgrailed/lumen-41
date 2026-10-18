/**
 * @jest-environment jsdom
 *
 * The day timeline keeps a slot above its rows for the personal-time band: it
 * draws nothing until something is put in it.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { Schedule } from "../HomeParts";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../root/V3Root", () => ({ useDesignV3: () => true }));

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

const render = (band?: unknown) =>
  act(async () =>
    root.render(
      h(Schedule, {
        items: [],
        nowHour: 10,
        hueOf: () => "red",
        evCount: 0,
        onOpen: jest.fn(),
        onCalendar: jest.fn(),
        band: band as never,
      })
    )
  );

it("draws no band slot while nothing is put in it", async () => {
  await render();
  expect(host.querySelector("[data-hd-sched-band]")).toBeNull();
});

it("draws what is put in the slot above the rows", async () => {
  await render(h("span", { "data-test-band": "" }, "Lunch"));
  const slot = host.querySelector("[data-hd-sched-band]");
  expect(slot?.querySelector("[data-test-band]")?.textContent).toBe("Lunch");
  expect(
    slot?.compareDocumentPosition(host.querySelector(".hd-sched-list") as Node)
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
});
