/**
 * @jest-environment jsdom
 *
 * The sample-day banner on Today: drawn only while examples exist, one button,
 * and that button runs the single clear action.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { SampleBanner } from "../SampleBanner";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mutate = jest.fn();
let status: { present: boolean } | undefined;
let pending = false;

jest.mock("@/lib/needt3/hooks/sample", () => ({
  useSampleStatus: () => ({ data: status }),
  useClearSample: () => ({ mutate, isPending: pending }),
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  jest.clearAllMocks();
  pending = false;
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => act(() => root.unmount()));
const mount = () => act(async () => root.render(h(SampleBanner)));

it("draws nothing while the status is unknown or there is nothing to clear", async () => {
  status = undefined;
  await mount();
  expect(host.querySelector("[data-hd-sample]")).toBeNull();
  status = { present: false };
  await mount();
  expect(host.querySelector("[data-hd-sample]")).toBeNull();
});

it("says it is a sample day and clears everything with one press", async () => {
  status = { present: true };
  await mount();
  expect(host.textContent).toContain("This is a sample day");
  const button = host.querySelector<HTMLButtonElement>(
    "[data-hd-sample-clear]"
  )!;
  expect(button.textContent).toBe("Clear examples");
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(mutate).toHaveBeenCalledTimes(1);
});

it("disables the button while clearing", async () => {
  status = { present: true };
  pending = true;
  await mount();
  expect(
    host.querySelector<HTMLButtonElement>("[data-hd-sample-clear]")!.disabled
  ).toBe(true);
});
